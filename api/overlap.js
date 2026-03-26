const supabase = require('./_lib/supabase');
const { groupByFund, buildMatrix } = require('./_lib/overlap-calc');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const { funds: fundsParam } = req.query;
    if (!fundsParam) return res.status(400).json({ error: 'funds param required' });

    const fundCodes = fundsParam.split(',').map(s => s.trim().toUpperCase()).slice(0, 5);
    if (fundCodes.length < 2) return res.status(400).json({ error: 'At least 2 funds required' });

    // Fetch latest holdings for requested funds
    const { data: holdingRows, error } = await supabase
      .from('fund_holdings')
      .select('fon_kodu, hisse_kodu, yuzdesel_agirlik, rapor_yil, rapor_ay')
      .in('fon_kodu', fundCodes)
      .order('rapor_yil', { ascending: false })
      .order('rapor_ay', { ascending: false });

    if (error) throw error;

    // Only use the most recent report per fund
    const latestByFund = {};
    const filteredRows = [];
    for (const row of holdingRows || []) {
      if (!latestByFund[row.fon_kodu]) {
        latestByFund[row.fon_kodu] = { yil: row.rapor_yil, ay: row.rapor_ay };
      }
      const latest = latestByFund[row.fon_kodu];
      if (row.rapor_yil === latest.yil && row.rapor_ay === latest.ay) {
        filteredRows.push(row);
      }
    }

    const holdingsByFund = groupByFund(filteredRows);
    const matrix = buildMatrix(holdingsByFund);

    // Detect funds with no holdings data
    const missingFunds = fundCodes.filter(c => !holdingsByFund[c]);

    // Build shared holdings list (stocks held by 2+ funds)
    const allTickers = new Set(filteredRows.map(r => r.hisse_kodu));
    const sharedHoldings = [];

    for (const ticker of allTickers) {
      const weights = {};
      let fundCount = 0;
      for (const code of fundCodes) {
        const w = holdingsByFund[code]?.[ticker];
        if (w !== undefined) {
          weights[code] = Math.round(w * 10000) / 100; // back to percentage
          fundCount++;
        }
      }
      if (fundCount >= 2) {
        sharedHoldings.push({ ticker, weights, fundCount });
      }
    }

    sharedHoldings.sort((a, b) =>
      b.fundCount - a.fundCount ||
      Object.values(b.weights).reduce((s, v) => s + v, 0) -
      Object.values(a.weights).reduce((s, v) => s + v, 0)
    );

    // Determine report period from the first fund with holdings
    const sample = Object.values(latestByFund)[0] ?? {};

    return res.status(200).json({
      rapor: { yil: sample.yil ?? null, ay: sample.ay ?? null },
      matrix,
      sharedHoldings,
      ...(missingFunds.length > 0 && {
        warnings: missingFunds.map(c => `${c} için holding verisi bulunamadı`),
      }),
    });
  } catch (err) {
    console.error('[overlap] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
