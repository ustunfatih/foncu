const supabase = require('./supabase');

function ensureSupabase(res) {
  if (supabase) return true;
  res.status(503).json({
    error: 'Veri hizmeti henüz yapılandırılmadı',
    code: 'DATA_SERVICE_NOT_CONFIGURED',
    retryable: false,
  });
  return false;
}

module.exports = { ensureSupabase };
