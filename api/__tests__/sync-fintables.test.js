process.env.CRON_SECRET = 'test-secret';

const syncFundProfiles = jest.fn();
const syncFundAllocations = jest.fn();
const syncFundMetrics = jest.fn();
const backfillMissingMetricHistory = jest.fn();
const syncFundHoldings = jest.fn();
const syncKapEvents = jest.fn();
const invalidateCacheByPrefix = jest.fn();

jest.mock('../_lib/providers/fund-profiles-provider', () => ({
  syncFundProfiles: (...args) => syncFundProfiles(...args),
  syncFundAllocations: (...args) => syncFundAllocations(...args),
}));

jest.mock('../_lib/providers/fund-metrics-provider', () => ({
  syncFundMetrics: (...args) => syncFundMetrics(...args),
}));

jest.mock('../_lib/providers/fund-history-provider', () => ({
  backfillMissingMetricHistory: (...args) => backfillMissingMetricHistory(...args),
}));

jest.mock('../_lib/providers/fund-holdings-provider', () => ({
  HOLDINGS_UNSUPPORTED_REASON:
    'Monthly holdings sync is handled by scripts/sync_kap_holdings.py and the GitHub Actions workflow.',
  syncFundHoldings: (...args) => syncFundHoldings(...args),
  syncKapEvents: (...args) => syncKapEvents(...args),
}));

jest.mock('../_lib/cache', () => ({
  invalidateCacheByPrefix: (...args) => invalidateCacheByPrefix(...args),
}));

const handler = require('../sync-fintables');

function createRes() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  syncFundProfiles.mockResolvedValue({
    profiles: [{ fon_kodu: 'AAA' }],
    profileCount: 1,
  });
  syncFundAllocations.mockResolvedValue({ allocationCount: 1 });
  syncFundMetrics.mockResolvedValue({
    metricCount: 1,
    coverage: {
      totalFundsRefreshed: 1,
      fundsWithYtd: 1,
      fundsWith1Y: 1,
      fundsWithSma200: 1,
      fundsWith1H: 1,
      fundsMissingHistory: 0,
    },
  });
  backfillMissingMetricHistory.mockResolvedValue({
    candidateCount: 1,
    backfilledFundCount: 1,
    insertedHistoryRowCount: 252,
    skippedFundCount: 0,
  });
  syncFundHoldings.mockResolvedValue({ holdingCount: 2 });
  syncKapEvents.mockResolvedValue({ kapEventCount: 3 });
});

test('runs the full sync and returns summary details', async () => {
  const req = { headers: {}, query: { secret: 'test-secret' } };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(200);
  expect(syncFundProfiles).toHaveBeenCalled();
  expect(syncFundAllocations).toHaveBeenCalled();
  expect(syncFundMetrics).toHaveBeenCalledWith([{ fon_kodu: 'AAA' }], expect.any(Array));
  expect(syncFundHoldings).not.toHaveBeenCalled();
  expect(syncKapEvents).toHaveBeenCalled();
  expect(res.payload.summary.coverage.fundsWithYtd).toBe(1);
  expect(res.payload.log).toContain('Monthly holdings sync is handled outside Vercel by the KAP workflow.');
  expect(res.payload.summary.skippedModules).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        module: 'holdings',
        supported: false,
      }),
    ])
  );
});

test('supports metrics-only backfill mode', async () => {
  const req = { headers: {}, query: { secret: 'test-secret', phase: 'metrics' } };
  const res = createRes();

  await handler(req, res);

  expect(syncFundProfiles).not.toHaveBeenCalled();
  expect(syncFundAllocations).not.toHaveBeenCalled();
  expect(backfillMissingMetricHistory).not.toHaveBeenCalled();
  expect(syncFundMetrics).toHaveBeenCalled();
  expect(syncFundHoldings).not.toHaveBeenCalled();
  expect(syncKapEvents).not.toHaveBeenCalled();
  expect(res.payload.log).toContain('Manual metrics-only refresh can be used as a backfill for existing funds.');
});

test('supports the daily sync phase without running holdings', async () => {
  const req = { headers: {}, query: { secret: 'test-secret', phase: 'daily' } };
  const res = createRes();

  await handler(req, res);

  expect(syncFundProfiles).toHaveBeenCalled();
  expect(syncFundAllocations).toHaveBeenCalled();
  expect(syncFundMetrics).toHaveBeenCalled();
  expect(syncKapEvents).toHaveBeenCalled();
  expect(syncFundHoldings).not.toHaveBeenCalled();
});

test('keeps monthly holdings sync as an explicit external phase', async () => {
  const req = { headers: {}, query: { secret: 'test-secret', phase: 'holdings' } };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(501);
  expect(res.payload.error).toContain('scripts/sync_kap_holdings.py');
  expect(syncFundProfiles).not.toHaveBeenCalled();
  expect(syncFundAllocations).not.toHaveBeenCalled();
  expect(syncFundMetrics).not.toHaveBeenCalled();
  expect(syncFundHoldings).not.toHaveBeenCalled();
  expect(res.payload.summary.skippedModules).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        module: 'holdings',
        supported: false,
      }),
    ])
  );
});

test('can backfill missing historical data before metrics refresh', async () => {
  const req = {
    headers: {},
    query: {
      secret: 'test-secret',
      phase: 'metrics',
      backfillMissingHistory: '1',
    },
  };
  const res = createRes();

  await handler(req, res);

  expect(backfillMissingMetricHistory).toHaveBeenCalledWith([], expect.any(Array));
  expect(syncFundMetrics).toHaveBeenCalled();
  expect(res.payload.summary.historyBackfill).toEqual({
    candidateCount: 1,
    backfilledFundCount: 1,
    insertedHistoryRowCount: 252,
    skippedFundCount: 0,
  });
});

test('invalidates cached read models after a sync', async () => {
  const req = { headers: {}, query: { secret: 'test-secret' } };
  const res = createRes();

  await handler(req, res);

  expect(invalidateCacheByPrefix).toHaveBeenCalledWith('funds:');
  expect(invalidateCacheByPrefix).toHaveBeenCalledWith('fund-screen:');
  expect(invalidateCacheByPrefix).toHaveBeenCalledWith('holdings-screener:');
  expect(invalidateCacheByPrefix).toHaveBeenCalledWith('fund-profile:');
  expect(res.payload.summary.invalidatedCaches).toEqual([
    'funds',
    'fund-screen',
    'holdings-screener',
    'fund-profile',
  ]);
});
