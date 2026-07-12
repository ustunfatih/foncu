const supabase = require('./supabase');

const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

module.exports = async function handleHealth(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!supabase) {
    return res.status(503).json({
      ok: false,
      status: 'degraded',
      dependencies: { database: { configured: false, reachable: false } },
    });
  }

  try {
    const { data, error } = await supabase
      .from('fund_profiles')
      .select('guncelleme_zamani')
      .order('guncelleme_zamani', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const updatedAt = data?.guncelleme_zamani || null;
    const timestamp = updatedAt ? new Date(updatedAt).getTime() : NaN;
    const stale = !Number.isFinite(timestamp) || Date.now() - timestamp > STALE_AFTER_MS;
    return res.status(200).json({
      ok: true,
      status: stale ? 'degraded' : 'healthy',
      dependencies: { database: { configured: true, reachable: true } },
      data: { fundProfiles: { updatedAt, stale } },
    });
  } catch (error) {
    console.error('[health] database check failed', error.message);
    return res.status(503).json({
      ok: false,
      status: 'degraded',
      dependencies: { database: { configured: true, reachable: false } },
    });
  }
};
