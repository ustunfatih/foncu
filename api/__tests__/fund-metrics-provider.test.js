const fromMock = jest.fn();
const fetchFundHistoryBatch = jest.fn();
const upsertRows = jest.fn();
const buildCoverageStats = jest.fn();

jest.mock('../_lib/supabase', () => ({
  from: (...args) => fromMock(...args),
}));

jest.mock('../_lib/history', () => ({
  fetchFundHistoryBatch: (...args) => fetchFundHistoryBatch(...args),
}));

jest.mock('../_lib/sync-helpers', () => {
  const actual = jest.requireActual('../_lib/sync-helpers');
  return {
    ...actual,
    upsertRows: (...args) => upsertRows(...args),
    buildCoverageStats: (...args) => buildCoverageStats(...args),
  };
});

const { syncFundMetrics } = require('../_lib/providers/fund-metrics-provider');

function createSelectQuery(data) {
  return {
    select: jest.fn(function select() { return this; }),
    order: jest.fn(function order() { return this; }),
    then: (resolve) => resolve({ data, error: null }),
  };
}

beforeEach(() => {
  fromMock.mockReset();
  fetchFundHistoryBatch.mockReset();
  upsertRows.mockReset();
  buildCoverageStats.mockReset();
  buildCoverageStats.mockReturnValue({
    totalFundsRefreshed: 1,
    fundsWithYtd: 1,
    fundsWith1Y: 1,
    fundsWithSma200: 1,
    fundsWith1H: 1,
    fundsMissingHistory: 0,
  });
  upsertRows.mockResolvedValue({ count: 1 });
});

test('syncFundMetrics loads full profile rows and upserts safe complete records', async () => {
  fromMock.mockReturnValue(createSelectQuery([
    {
      fon_kodu: 'AAA',
      unvan: 'Alpha Fund',
      fon_tipi: 'mutual',
      stopaj: 10,
    },
  ]));
  fetchFundHistoryBatch.mockResolvedValue({
    AAA: Array.from({ length: 220 }, (_, index) => ({
      date: new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10),
      value: 100 + index,
    })),
  });

  const log = [];
  await syncFundMetrics([], log, { asOf: new Date('2026-03-24T00:00:00Z') });

  expect(fetchFundHistoryBatch).toHaveBeenCalled();
  expect(upsertRows).toHaveBeenCalledWith(
    'fund_profiles',
    expect.arrayContaining([
      expect.objectContaining({
        fon_kodu: 'AAA',
        unvan: 'Alpha Fund',
        fon_tipi: 'mutual',
        stopaj: 10,
        getiri_3a: expect.any(Number),
        getiri_6a: expect.any(Number),
      }),
    ]),
    'fon_kodu'
  );
});
