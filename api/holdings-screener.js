const supabase = require('./_lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  try {
    const { ticker, minWeight = 0, fundType = 'mutual', limit = 50 } = req.query;
    if (!ticker) return res.status(400).json({ error: 'ticker param required' });

    const kindMap = {
      YAT: 'mutual', EMK: 'pension', BYF: 'exchange',
      mutual: 'mutual', pension: 'pension', exchange: 'exchange'
    };
    const fon_tipi = kindMap[fundType] ?? 'mutual';

    // Get latest holdings for this ticker across all funds
    const { data: holdingRows, error } = await supabase
      .from('fund_holdings')
      .select('fon_kodu, yuzdesel_agirlik, rapor_yil, rapor_ay')
      .eq('hisse_kodu', ticker.toUpperCase())
      .gte('yuzdesel_agirlik', Number(minWeight))
      .order('rapor_yil', { ascending: false })
      .order('rapor_ay', { ascending: false });

    if (error) throw error;

    // Deduplicate: only the latest report per fund
    const latestPerFund = {};
    for (const row of holdingRows || []) {
      if (!latestPerFund[row.fon_kodu]) latestPerFund[row.fon_kodu] = row;
    }

    const fundCodes = Object.keys(latestPerFund);
    if (!fundCodes.length) {
      return res.status(200).json({ ticker: ticker.toUpperCase(), fonlar: [], rapor: null });
    }

    // Join with fund_profiles to get metadata and filter by fund type
    const { data: profiles } = await supabase
      .from('fund_profiles')
      .select('fon_kodu, unvan, portfoy_yonetim_sirketi, getiri_1y, risk_seviyesi, fon_tipi')
      .in('fon_kodu', fundCodes)
      .eq('fon_tipi', fon_tipi);

    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.fon_kodu, p]));

    const fonlar = fundCodes
      .map(code => {
        const h = latestPerFund[code];
        const p = profileMap[code];
        if (!p) return null;
        return {
          fon_kodu: code,
          unvan: p.unvan,
          portfoy_yonetim_sirketi: p.portfoy_yonetim_sirketi,
          agirlik: h.yuzdesel_agirlik,
          getiri_1y: p.getiri_1y,
          risk_seviyesi: p.risk_seviyesi,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.agirlik - a.agirlik)
      .slice(0, Number(limit));

    const sample = Object.values(latestPerFund)[0];
    return res.status(200).json({
      ticker: ticker.toUpperCase(),
      rapor: sample ? { yil: sample.rapor_yil, ay: sample.rapor_ay } : null,
      fonlar,
    });
  } catch (err) {
    console.error('[holdings-screener] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
