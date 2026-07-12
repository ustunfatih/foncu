const supabase = require('./_lib/supabase');

const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

function freshness(updatedAt) {
  if (!updatedAt) return { updatedAt: null, stale: true };
  const timestamp = new Date(updatedAt).getTime();
  return {
    updatedAt,
    stale: !Number.isFinite(timestamp) || Date.now() - timestamp > STALE_AFTER_MS,
  };
}

module.exports = async function health(req, res) {
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

    const dataFreshness = freshness(data?.guncelleme_zamani);
    return res.status(dataFreshness.stale ? 200 : 200).json({
      ok: true,
      status: dataFreshness.stale ? 'degraded' : 'healthy',
      dependencies: { database: { configured: true, reachable: true } },
      data: { fundProfiles: dataFreshness },
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
