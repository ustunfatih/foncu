const supabase = require('./_lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  try {
    const { start, end, type } = req.query;

    // Default: next 30 days
    const startDate = start ?? new Date().toISOString().split('T')[0];
    const endDate = end ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    let query = supabase
      .from('kap_events')
      .select('*')
      .gte('olay_tarihi', startDate)
      .lte('olay_tarihi', endDate)
      .order('olay_tarihi', { ascending: true });

    if (type) query = query.eq('olay_tipi', type);

    const { data, error } = await query;
    if (error) throw error;

    const events = (data || []).map(e => ({
      id: e.id,
      date: e.olay_tarihi,
      type: e.olay_tipi,
      ticker: e.hisse_kodu,
      fundCode: e.fon_kodu,
      title: e.baslik,
      description: e.aciklama,
      value: e.deger,
      kapId: e.kap_bildirim_id,
    }));

    return res.status(200).json({ events, count: events.length });
  } catch (err) {
    console.error('[market-events] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
