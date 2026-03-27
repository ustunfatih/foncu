const supabase = require('./_lib/supabase');
const { groupByFund, buildMatrix } = require('./_lib/overlap-calc');
const { resolveLatestCommonHoldingsPeriod } = require('./_lib/holdings-periods');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  try {
    const { funds: fundsParam } = req.query;
    if (!fundsParam) return res.status(400).json({ error: 'funds param required' });
    if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });

    const fundCodes = fundsParam.split(',').map(s => s.trim().toUpperCase()).slice(0, 5);
    if (fundCodes.length < 2) return res.status(400).json({ error: 'At least 2 funds required' });

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

    const holdingsByFund = groupByFund(holdingRows || []);
    const matrix = buildMatrix(holdingsByFund);

    // Build shared holdings list (stocks held by 2+ funds)
    const allTickers = new Set((holdingRows || []).map(r => r.hisse_kodu));
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

    return res.status(200).json({
      rapor: { yil: reportPeriod.yil, ay: reportPeriod.ay },
      matrix,
      sharedHoldings,
    });
  } catch (err) {
    console.error('[overlap] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
