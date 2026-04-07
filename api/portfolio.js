const supabase = require('./_lib/supabase');
const { fetchLatestPriceBatch } = require('./_lib/history');
const { resolveLatestCommonHoldingsPeriod } = require('./_lib/holdings-periods');
const { ensureSupabase } = require('./_lib/supabase-guard');

function parseBody(req, res) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' });
      return null;
    }
  }
  return req.body || {};
}

function validateValuationHoldings(holdings) {
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return { error: { error: 'Holdings must be a non-empty array' } };
  }

  const errors = [];
  const normalized = holdings.map((holding, index) => {
    const row = holding && typeof holding === 'object' ? holding : {};
    const code = String(row.code ?? '').trim().toUpperCase();
    const shares = Number(row.shares);
    const cost = Number(row.cost);

    if (!code) errors.push({ index, field: 'code', message: 'code must be a non-empty string' });
    if (!Number.isFinite(shares) || shares <= 0) errors.push({ index, field: 'shares', message: 'shares must be a finite number greater than 0' });
    if (!Number.isFinite(cost) || cost < 0) errors.push({ index, field: 'cost', message: 'cost must be a finite number greater than or equal to 0' });

    return { code, shares, cost };
  });

  if (errors.length > 0) {
    return {
      error: {
        error: 'Invalid holdings entries',
        details: errors,
      },
    };
  }

  return { holdings: normalized };
}

function validateExposureHoldings(holdings) {
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return { error: { error: 'Holdings must be a non-empty array' } };
  }

  const errors = [];
  const normalized = holdings.map((holding, index) => {
    const row = holding && typeof holding === 'object' ? holding : {};
    const fundCode = String(row.fundCode ?? '').trim().toUpperCase();
    const shares = Number(row.shares);
    const currentValue = Number(row.currentValue);

    if (!fundCode) errors.push({ index, field: 'fundCode', message: 'fundCode must be a non-empty string' });
    if (!Number.isFinite(shares) || shares <= 0) errors.push({ index, field: 'shares', message: 'shares must be a finite number greater than 0' });
    if (!Number.isFinite(currentValue) || currentValue < 0) errors.push({ index, field: 'currentValue', message: 'currentValue must be a finite number greater than or equal to 0' });

    return { fundCode, shares, currentValue };
  });

  if (errors.length > 0) {
    return {
      error: {
        error: 'Invalid holdings entries',
        details: errors,
      },
    };
  }

  return { holdings: normalized };
}

async function handleValuation(req, res) {
  if (!ensureSupabase(res)) return;

  const body = parseBody(req, res);
  if (body === null) return;

  const validation = validateValuationHoldings(body.holdings);
  if (validation.error) return res.status(400).json(validation.error);

  const normalizedHoldings = validation.holdings;

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
    const value = price * holding.shares;
    const costValue = holding.cost * holding.shares;
    totalValue += value;
    totalCost += costValue;
    enriched.push({
      code: holding.code,
      shares: holding.shares,
      cost: holding.cost,
      latestPrice: price,
      latestDate: latest?.date || null,
      value,
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
  if (!ensureSupabase(res)) return;

  const body = parseBody(req, res);
  if (body === null) return;

  const validation = validateExposureHoldings(body.holdings);
  if (validation.error) return res.status(400).json(validation.error);

  const holdings = validation.holdings;
  const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  if (totalValue === 0) return res.status(400).json({ error: 'totalValue is 0' });

  const fundCodes = holdings.map(h => h.fundCode);
  const allocationByFund = Object.fromEntries(
    holdings.map(h => [h.fundCode, h.currentValue / totalValue])
  );

  const reportPeriod = await resolveLatestCommonHoldingsPeriod(fundCodes);
  if (!reportPeriod) {
    return res.status(409).json({
      error: 'Selected funds do not share a common monthly holdings report yet',
    });
  }

  const { data: holdingRows, error } = await supabase
    .from('fund_holdings')
    .select('fon_kodu, hisse_kodu, yuzdesel_agirlik, rapor_yil, rapor_ay')
    .in('fon_kodu', fundCodes)
    .eq('rapor_yil', reportPeriod.yil)
    .eq('rapor_ay', reportPeriod.ay);

  if (error) throw error;

  const exposureMap = {};
  for (const row of holdingRows || []) {
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

  return res.status(200).json({
    totalValue,
    rapor: { yil: reportPeriod.yil, ay: reportPeriod.ay },
    exposure,
  });
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
