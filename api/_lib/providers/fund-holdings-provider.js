const HOLDINGS_UNSUPPORTED_REASON =
  'Monthly holdings sync is handled by scripts/sync_kap_holdings.py and the GitHub Actions workflow.';

async function syncFundHoldings(log) {
  log.push('Monthly fund holdings sync is handled by the KAP workflow, not by Vercel runtime.');
  return {
    supported: false,
    reason: HOLDINGS_UNSUPPORTED_REASON,
    holdingCount: 0,
    reportPeriod: null,
  };
}

async function syncKapEvents(log) {
  log.push('Skipping KAP events sync: no public replacement has been wired yet.');
  return { kapEventCount: 0 };
}

module.exports = {
  HOLDINGS_UNSUPPORTED_REASON,
  syncFundHoldings,
  syncKapEvents,
};
