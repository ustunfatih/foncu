const supabase = require('./_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { holdings } = req.body;
    if (!Array.isArray(holdings) || !holdings.length) {
      return res.status(400).json({ error: 'holdings array required' });
    }

    // holdings: [{ fundCode, shares, currentValue }]
    const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0);
    if (totalValue === 0) return res.status(400).json({ error: 'totalValue is 0' });

    const fundCodes = holdings.map(h => h.fundCode.toUpperCase());
    const allocationByFund = Object.fromEntries(
      holdings.map(h => [h.fundCode.toUpperCase(), h.currentValue / totalValue])
    );

    // Fetch latest holdings for all funds in the portfolio
    const { data: holdingRows, error } = await supabase
      .from('fund_holdings')
      .select('fon_kodu, hisse_kodu, yuzdesel_agirlik, rapor_yil, rapor_ay')
      .in('fon_kodu', fundCodes)
      .order('rapor_yil', { ascending: false })
      .order('rapor_ay', { ascending: false });

    if (error) throw error;

    // Only use the latest report per fund
    const latestByFund = {};
    const filtered = [];
    for (const row of holdingRows || []) {
      if (!latestByFund[row.fon_kodu]) {
        latestByFund[row.fon_kodu] = { yil: row.rapor_yil, ay: row.rapor_ay };
      }
      const l = latestByFund[row.fon_kodu];
      if (row.rapor_yil === l.yil && row.rapor_ay === l.ay) filtered.push(row);
    }

    // Aggregate effective exposure per stock
    const exposureMap = {};
    for (const row of filtered) {
      const fundAlloc = allocationByFund[row.fon_kodu] ?? 0;
      const stockWeight = (row.yuzdesel_agirlik ?? 0) / 100;
      const contribution = fundAlloc * stockWeight;

      if (!exposureMap[row.hisse_kodu]) {
        exposureMap[row.hisse_kodu] = { effectiveWeight: 0, byFund: {} };
      }
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
    return res.status(200).json({
      totalValue,
      rapor: { yil: sample.yil ?? null, ay: sample.ay ?? null },
      exposure,
    });
  } catch (err) {
    console.error('[portfolio-exposure] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
