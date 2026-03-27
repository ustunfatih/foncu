async function syncFundHoldings(log) {
  log.push('Monthly fund holdings sync is handled by the KAP workflow, not by Vercel runtime.');

  const error = new Error(
    'Monthly holdings sync is handled by scripts/sync_kap_holdings.py and the GitHub Actions workflow.'
  );
  error.statusCode = 501;
  throw error;
}

async function syncKapEvents(log) {
  log.push('Skipping KAP events sync: no public replacement has been wired yet.');
  return { kapEventCount: 0 };
}

module.exports = {
  syncFundHoldings,
  syncKapEvents,
};
