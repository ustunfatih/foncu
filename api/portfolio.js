const supabase = require('./_lib/supabase');
const { fetchLatestPriceBatch } = require('./_lib/history');

async function handleValuation(req, res) {
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });

  let body = req.body;
  if (typeof req.body === 'string') {
    try { body = JSON.parse(req.body); } catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
  }
  const { holdings = [] } = body || {};
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return res.status(400).json({ error: 'Holdings must be a non-empty array' });
  }

  const normalizedHoldings = holdings
    .map(h => ({ code: (h.code || '').toString().trim().toUpperCase(), shares: Number(h.shares), cost: Number(h.cost) }))
    .filter(h => h.code && Number.isFinite(h.shares) && h.shares > 0);

  if (normalizedHoldings.length === 0) return res.status(422).json({ error: 'Holdings contain no valid entries' });

  const uniqueCodes = [...new Set(normalizedHoldings.map(h => h.code))];
  let latestPricesBatch = {};
  let batchError = null;
  try {
    latestPricesBatch = await fetchLatestPriceBatch(uniqueCodes);
  } catch (err) {
    console.error('[portfolio/valuation] Batch fetch failed', err);
    batchError = err;
  }

  const latestByCode = new Map(
    normalizedHoldings.map(h => [h.code, batchError ? { code: h.code, error: batchError } : { code: h.code, latest: latestPricesBatch[h.code] || null }])
  );

  let totalValue = 0, totalCost = 0;
  const enriched = [];
  for (const holding of normalizedHoldings) {
    const entry = latestByCode.get(holding.code);
    const latest = entry?.latest || null;
    const price = latest ? latest.value : 0;
    const costPerShare = Number.isFinite(holding.cost) ? holding.cost : 0;
    const value = price * holding.shares;
    const costValue = costPerShare * holding.shares;
    totalValue += value;
    totalCost += costValue;
    enriched.push({
      code: holding.code, shares: holding.shares, cost: costPerShare,
      latestPrice: price, latestDate: latest?.date || null, value,
      pnl: value - costValue,
      error: entry?.error ? (entry.error.message || 'Latest price lookup failed') : null,
      warning: latest ? null : 'Latest price not found',
    });
  }

  return res.status(200).json({
    totalValue, totalCost,
    pnl: totalValue - totalCost,
    pnlPct: totalCost > 0 ? (totalValue - totalCost) / totalCost : null,
    holdings: enriched.map(h => ({ ...h, weight: totalValue > 0 ? h.value / totalValue : 0 })),
  });
}

async function handleExposure(req, res) {
  const { holdings } = req.body;
  if (!Array.isArray(holdings) || !holdings.length) {
    return res.status(400).json({ error: 'holdings array required' });
  }

  const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0);
  if (totalValue === 0) return res.status(400).json({ error: 'totalValue is 0' });

  const fundCodes = holdings.map(h => h.fundCode.toUpperCase());
  const allocationByFund = Object.fromEntries(
    holdings.map(h => [h.fundCode.toUpperCase(), h.currentValue / totalValue])
  );

  const { data: holdingRows, error } = await supabase
    .from('fund_holdings')
    .select('fon_kodu, hisse_kodu, yuzdesel_agirlik, rapor_yil, rapor_ay')
    .in('fon_kodu', fundCodes)
    .order('rapor_yil', { ascending: false })
    .order('rapor_ay', { ascending: false });

  if (error) throw error;

  const latestByFund = {};
  const filtered = [];
  for (const row of holdingRows || []) {
    if (!latestByFund[row.fon_kodu]) latestByFund[row.fon_kodu] = { yil: row.rapor_yil, ay: row.rapor_ay };
    const l = latestByFund[row.fon_kodu];
    if (row.rapor_yil === l.yil && row.rapor_ay === l.ay) filtered.push(row);
  }

  const exposureMap = {};
  for (const row of filtered) {
    const fundAlloc = allocationByFund[row.fon_kodu] ?? 0;
    const stockWeight = (row.yuzdesel_agirlik ?? 0) / 100;
    const contribution = fundAlloc * stockWeight;
    if (!exposureMap[row.hisse_kodu]) exposureMap[row.hisse_kodu] = { effectiveWeight: 0, byFund: {} };
    exposureMap[row.hisse_kodu].effectiveWeight += contribution;
    exposureMap[row.hisse_kodu].byFund[row.fon_kodu] = {
      fundWeight: row.yuzdesel_agirlik,
      contribution: Math.round(contribution * 10000) / 100,
    };
  }

  const exposure = Object.entries(exposureMap)
    .map(([ticker, data]) => ({
      ticker,
      effectiveWeight: Math.round(data.effectiveWeight * 10000) / 100,
      effectiveTRY: Math.round(data.effectiveWeight * totalValue),
      byFund: data.byFund,
    }))
    .sort((a, b) => b.effectiveWeight - a.effectiveWeight);

  const sample = Object.values(latestByFund)[0] ?? {};
  return res.status(200).json({ totalValue, rapor: { yil: sample.yil ?? null, ay: sample.ay ?? null }, exposure });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { type } = req.query;
    if (type === 'exposure') return await handleExposure(req, res);
    return await handleValuation(req, res);
  } catch (err) {
    console.error('[portfolio] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
