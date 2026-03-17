const supabase = require('./_lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');

  try {
    const {
      kind = 'YAT',
      minReturn1y = 0,
      minReturn1m,
      limit = 50
    } = req.query;

    const kindMap = { YAT: 'mutual', EMK: 'pension', BYF: 'exchange' };
    const fon_tipi = kindMap[kind.toUpperCase()] ?? 'mutual';

    let query = supabase
      .from('fund_profiles')
      .select([
        'fon_kodu', 'unvan', 'fon_tipi', 'risk_seviyesi',
        'portfoy_yonetim_sirketi', 'fon_kategorisi',
        'getiri_1y', 'getiri_1a', 'getiri_3a',
        'fon_buyuklugu', 'yatirimci_sayisi',
        'stopaj', 'yonetim_ucreti'
      ].join(', '))
      .eq('fon_tipi', fon_tipi)
      .gte('getiri_1y', Number(minReturn1y))
      .not('getiri_1y', 'is', null)
      .order('getiri_1y', { ascending: false })
      .limit(Number(limit));

    if (minReturn1m !== undefined) {
      query = query.gte('getiri_1a', Number(minReturn1m));
    }

    const { data, error } = await query;
    if (error) throw error;

    const results = (data || []).map(f => ({
      code: f.fon_kodu,
      title: f.unvan,
      kind: kind.toUpperCase(),
      return1y: f.getiri_1y,
      return1m: f.getiri_1a,
      return3m: f.getiri_3a,
      aum: f.fon_buyuklugu,
      investors: f.yatirimci_sayisi,
      riskLevel: f.risk_seviyesi,
      manager: f.portfoy_yonetim_sirketi,
      category: f.fon_kategorisi,
      stopaj: f.stopaj,
      managementFee: f.yonetim_ucreti,
    }));

    return res.status(200).json({ results, total: results.length });
  } catch (err) {
    console.error('[fund-screen] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
