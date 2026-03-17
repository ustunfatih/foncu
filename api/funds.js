const supabase = require('./_lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');

  try {
    const kind = (req.query.kind || 'YAT').toString().toUpperCase();

    // Map legacy kind codes to fon_tipi values stored in fund_profiles
    const kindMap = { YAT: 'mutual', EMK: 'pension', BYF: 'exchange' };
    const fon_tipi = kindMap[kind];
    if (!fon_tipi) {
      return res.status(400).json({ error: `Invalid kind: ${kind}` });
    }

    const { data, error } = await supabase
      .from('fund_profiles')
      .select('fon_kodu, unvan, fon_tipi, risk_seviyesi, portfoy_yonetim_sirketi, tefasa_acik')
      .eq('fon_tipi', fon_tipi)
      .order('fon_kodu');

    if (error) throw error;

    // Return shape compatible with existing frontend FundSummary type
    const funds = (data || []).map(f => ({
      code: f.fon_kodu,
      title: f.unvan,
      kind,
    }));

    return res.status(200).json({ funds });
  } catch (err) {
    console.error('[funds] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
