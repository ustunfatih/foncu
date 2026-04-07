const supabase = require('./_lib/supabase');
const { ensureSupabase } = require('./_lib/supabase-guard');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  if (!ensureSupabase(res)) return;

  try {
    const {
      kind = 'YAT',
      mode = 'rsi',         // 'rsi' | 'sma' | 'ma200'
      rsiThreshold = 35,
      limit = 50
    } = req.query;

    const kindMap = { YAT: 'mutual', EMK: 'pension', BYF: 'exchange' };
    const fon_tipi = kindMap[kind.toUpperCase()] ?? 'mutual';

    const baseSelect = [
      'fon_kodu', 'unvan', 'portfoy_yonetim_sirketi',
      'rsi_14', 'rsi_sinyal', 'sma_20', 'sma_50', 'sma_200',
      'son_fiyat', 'ma200_ustu', 'sma_kesisim_20_50',
      'getiri_1a', 'getiri_1y', 'risk_seviyesi'
    ].join(', ');

    let query = supabase
      .from('fund_profiles')
      .select(baseSelect)
      .eq('fon_tipi', fon_tipi);

    if (mode === 'rsi') {
      query = query
        .not('rsi_14', 'is', null)
        .lte('rsi_14', Number(rsiThreshold))
        .order('rsi_14', { ascending: true });
    } else if (mode === 'sma') {
      query = query
        .eq('sma_kesisim_20_50', true)
        .order('rsi_14', { ascending: true });
    } else if (mode === 'ma200') {
      query = query
        .eq('ma200_ustu', true)
        .not('sma_200', 'is', null)
        .order('getiri_1y', { ascending: false });
    }

    query = query.limit(Number(limit));
    const { data, error } = await query;
    if (error) throw error;

    const results = (data || []).map(f => ({
      code: f.fon_kodu,
      title: f.unvan,
      manager: f.portfoy_yonetim_sirketi,
      rsi: f.rsi_14,
      rsiSignal: f.rsi_sinyal,
      sma20: f.sma_20,
      sma50: f.sma_50,
      sma200: f.sma_200,
      price: f.son_fiyat,
      aboveMa200: f.ma200_ustu,
      smaCrossover: f.sma_kesisim_20_50,
      return1m: f.getiri_1a,
      return1y: f.getiri_1y,
      riskLevel: f.risk_seviyesi,
    }));

    return res.status(200).json({ results, mode, total: results.length });
  } catch (err) {
    console.error('[fund-technical-scan] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
