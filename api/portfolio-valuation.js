const supabase = require('./_lib/supabase');
const { fetchLatestPriceBatch } = require('./_lib/history');

module.exports = async function handler(req, res) {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    let body = req.body;
    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }
    const { holdings = [] } = body || {};
    if (!Array.isArray(holdings) || holdings.length === 0) {
      return res.status(400).json({ error: 'Holdings must be a non-empty array' });
    }

    const normalizedHoldings = holdings
      .map((holding) => ({
        code: (holding.code || '').toString().trim().toUpperCase(),
        shares: Number(holding.shares),
        cost: Number(holding.cost),
      }))
      .filter((holding) => holding.code && Number.isFinite(holding.shares) && holding.shares > 0);

    if (normalizedHoldings.length === 0) {
      return res.status(422).json({ error: 'Holdings contain no valid entries' });
    }

    const uniqueCodes = [...new Set(normalizedHoldings.map((h) => h.code))];
    let latestPricesBatch = {};
    let batchError = null;

    try {
      latestPricesBatch = await fetchLatestPriceBatch(uniqueCodes);
    } catch (err) {
      console.error('[portfolio-valuation] Batch fetch failed', err);
      batchError = err;
    }

    const latestPrices = normalizedHoldings.map((holding) => {
      if (batchError) {
        return { code: holding.code, error: batchError };
      }
      const latest = latestPricesBatch[holding.code] || null;
      return { code: holding.code, latest };
    });

    const latestByCode = new Map(latestPrices.map((item) => [item.code, item]));
    const enriched = [];
    let totalValue = 0;
    let totalCost = 0;

    for (const holding of normalizedHoldings) {
      const latestEntry = latestByCode.get(holding.code);
      const latest = latestEntry?.latest || null;
      const price = latest ? latest.value : 0;
      const costPerShare = Number.isFinite(holding.cost) ? holding.cost : 0;
      const value = price * holding.shares;
      const costValue = costPerShare * holding.shares;
      totalValue += value;
      totalCost += costValue;

      enriched.push({
        code: holding.code,
        shares: holding.shares,
        cost: costPerShare,
        latestPrice: price,
        latestDate: latest?.date || null,
        value,
        pnl: value - costValue,
        error: latestEntry?.error ? latestEntry.error.message || 'Latest price lookup failed' : null,
        warning: latest ? null : 'Latest price not found',
      });
    }

    const holdingsWithWeights = enriched.map((holding) => ({
      ...holding,
      weight: totalValue > 0 ? holding.value / totalValue : 0,
    }));

    return res.status(200).json({
      totalValue,
      totalCost,
      pnl: totalValue - totalCost,
      pnlPct: totalCost > 0 ? (totalValue - totalCost) / totalCost : null,
      holdings: holdingsWithWeights,
    });
  } catch (error) {
    console.error('[portfolio-valuation] failed', error);
    return res.status(500).json({ error: 'Failed to value portfolio' });
  }
};
