const { syncFundProfiles, syncFundAllocations } = require('./_lib/providers/fund-profiles-provider');
const { syncFundMetrics } = require('./_lib/providers/fund-metrics-provider');
const { backfillMissingMetricHistory } = require('./_lib/providers/fund-history-provider');
const { syncFundHoldings, syncKapEvents } = require('./_lib/providers/fund-holdings-provider');
const { invalidateCacheByPrefix } = require('./_lib/cache');

const CRON_SECRET = process.env.CRON_SECRET;

module.exports = async (req, res) => {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const bearerToken = (req.headers['authorization'] || '').replace('Bearer ', '');
  const isVercelCron = !!CRON_SECRET && bearerToken === CRON_SECRET;
  const isManual = !!CRON_SECRET && req.query.secret === CRON_SECRET;
  if (!isVercelCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const phase = (req.query.phase || 'all').toString().toLowerCase();
  const fintablesToken = req.query.token || undefined; // optional one-time token override
  const shouldBackfillMissingHistory =
    req.query.backfillMissingHistory === '1' || req.query.backfillMissingHistory === 'true';
  const log = [];
  const startedAt = Date.now();

  try {
    let profiles = [];
    const summary = {
      phase,
      profileCount: 0,
      allocationCount: 0,
      metricCount: 0,
      holdingCount: 0,
      kapEventCount: 0,
      coverage: {
        totalFundsRefreshed: 0,
        fundsWithYtd: 0,
        fundsWith1Y: 0,
        fundsWithSma200: 0,
        fundsWith1H: 0,
        fundsMissingHistory: 0,
      },
      historyBackfill: {
        candidateCount: 0,
        backfilledFundCount: 0,
        insertedHistoryRowCount: 0,
        skippedFundCount: 0,
      },
    };

    const shouldRunProfiles = phase === 'all' || phase === 'profiles' || phase === 'daily';
    const shouldRunMetrics = phase === 'all' || phase === 'metrics' || phase === 'daily';
    const shouldRunHoldings = phase === 'all' || phase === 'holdings';
    const shouldRunEvents = phase === 'all' || phase === 'events' || phase === 'daily';

    if (shouldRunProfiles) {
      const profileResult = await syncFundProfiles(log);
      profiles = profileResult.profiles;
      summary.profileCount = profileResult.profileCount;
    }

    if (shouldRunProfiles) {
      const allocationResult = await syncFundAllocations(log);
      summary.allocationCount = allocationResult.allocationCount;
    }

    if (shouldRunMetrics) {
      if (shouldBackfillMissingHistory) {
        summary.historyBackfill = await backfillMissingMetricHistory(profiles, log);
      }
      const metricResult = await syncFundMetrics(profiles, log);
      summary.metricCount = metricResult.metricCount;
      summary.coverage = metricResult.coverage;
      if (phase === 'metrics') {
        log.push('Manual metrics-only refresh can be used as a backfill for existing funds.');
      }
    }

    if (shouldRunHoldings) {
      const holdingResult = await syncFundHoldings(log, fintablesToken);
      summary.holdingCount = holdingResult.holdingCount;
      summary.holdingsReportPeriod = holdingResult.reportPeriod ?? null;
    }

    if (shouldRunEvents) {
      const kapResult = await syncKapEvents(log, fintablesToken);
      summary.kapEventCount = kapResult.kapEventCount;
    }

    invalidateCacheByPrefix('funds:');
    invalidateCacheByPrefix('fund-screen:');
    invalidateCacheByPrefix('holdings-screener:');
    invalidateCacheByPrefix('fund-profile:');
    summary.invalidatedCaches = ['funds', 'fund-screen', 'holdings-screener', 'fund-profile'];

    const elapsed = Date.now() - startedAt;
    log.push(`Completed sync phase "${phase}" in ${elapsed}ms`);

    return res.status(200).json({
      ok: true,
      elapsed,
      summary,
      log,
    });
  } catch (err) {
    console.error('[sync-fintables] Error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message,
      log,
    });
  }
};
