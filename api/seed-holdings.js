const { syncFundHoldings } = require('./_lib/providers/fund-holdings-provider');
const { invalidateCacheByPrefix } = require('./_lib/cache');

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * One-time seed endpoint for fund_holdings table.
 *
 * Usage (browser URL bar):
 *   /api/seed-holdings?secret=<CRON_SECRET>&token=<FINTABLES_TOKEN>
 *
 * - secret: required, must match CRON_SECRET env var
 * - token: required, a valid Fintables MCP bearer token (get from browser DevTools)
 *
 * The endpoint fetches all fund holdings from Fintables MCP (paginated)
 * and upserts them into the Supabase fund_holdings table.
 */
module.exports = async (req, res) => {
  // Auth check
  if (!CRON_SECRET || req.query.secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized. Provide ?secret=<CRON_SECRET>' });
  }

  const fintablesToken = req.query.token;
  if (!fintablesToken) {
    return res.status(400).json({
      error: 'Missing Fintables token. Provide ?token=<YOUR_FINTABLES_TOKEN>',
      help: [
        '1. Fintables.com\'a giriş yap',
        '2. Tarayıcı DevTools > Network sekmesini aç',
        '3. Herhangi bir sayfayı yenile',
        '4. evo.fintables.com isteğini bul, Authorization header\'dan Bearer token\'ı kopyala',
        '5. Bu endpoint\'i token parametresiyle çağır',
      ],
    });
  }

  const log = [];
  const startedAt = Date.now();

  try {
    log.push('Starting fund holdings seed...');
    const result = await syncFundHoldings(log, fintablesToken);

    invalidateCacheByPrefix('holdings-screener:');
    invalidateCacheByPrefix('fund-profile:');

    const elapsed = Date.now() - startedAt;
    log.push(`Seed completed in ${elapsed}ms`);

    return res.status(200).json({
      ok: true,
      elapsed,
      holdingCount: result.holdingCount,
      log,
    });
  } catch (err) {
    console.error('[seed-holdings] Error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message,
      log,
    });
  }
};
