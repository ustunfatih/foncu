const supabase = require('./supabase');

function ensureSupabase(res) {
  if (supabase) return true;
  res.status(503).json({ error: 'Supabase not configured' });
  return false;
}

module.exports = { ensureSupabase };
