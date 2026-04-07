const supabase = require('./supabase');

function ensureSupabase(res) {
  if (supabase) {
    return true;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(503).json({ error: 'Supabase not configured' });
  return false;
}

module.exports = {
  ensureSupabase,
};
