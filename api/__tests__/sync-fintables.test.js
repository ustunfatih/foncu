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
  expect(syncFundHoldings).toHaveBeenCalled();
  expect(syncKapEvents).toHaveBeenCalled();
  expect(res.payload.summary.coverage.fundsWithYtd).toBe(1);
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
