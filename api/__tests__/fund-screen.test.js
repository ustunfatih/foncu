jest.mock('../_lib/cache', () => ({
  TTL: { FUND_SCREEN: 1234 },
  createCacheKey: jest.fn(() => 'fund-screen:test'),
  getOrSetCache: jest.fn(async (_key, _ttl, loader) => ({ value: await loader(), cached: false })),
}));

const hydrateFundMetricRows = jest.fn(async (rows) => rows);
jest.mock('../_lib/providers/fund-metrics-provider', () => ({
  hydrateFundMetricRows: (...args) => hydrateFundMetricRows(...args),
}));

const queryState = { calls: [] };

function createQueryMock(responseRows) {
  const query = {
    select: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn(() => query),
    eq: jest.fn((...args) => {
      queryState.calls.push(['eq', ...args]);
      return query;
    }),
    ilike: jest.fn((...args) => {
      queryState.calls.push(['ilike', ...args]);
      return query;
    }),
    gte: jest.fn((...args) => {
      queryState.calls.push(['gte', ...args]);
      return query;
    }),
    lte: jest.fn((...args) => {
      queryState.calls.push(['lte', ...args]);
      return query;
    }),
    not: jest.fn((...args) => {
      queryState.calls.push(['not', ...args]);
      return query;
    }),
    then: (resolve) => resolve({ data: responseRows, error: null }),
  };
  return query;
}

const fromMock = jest.fn();
jest.mock('../_lib/supabase', () => ({
  from: (...args) => fromMock(...args),
}));

const handler = require('../fund-screen');

function createRes() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(key, value) {
      this.headers[key] = value;
    },
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
  queryState.calls = [];
  fromMock.mockReset();
  hydrateFundMetricRows.mockReset();
  hydrateFundMetricRows.mockImplementation(async (rows) => rows);
});

test('returns screener results with meta data', async () => {
  fromMock.mockReturnValue(createQueryMock([
    {
      fon_kodu: 'AAA',
      unvan: 'Alpha Fund',
      guncelleme_zamani: '2026-03-24T10:00:00.000Z',
    },
  ]));

  const req = { query: {} };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(200);
  expect(res.payload.results).toHaveLength(1);
  expect(res.payload.meta).toEqual({
    cached: false,
    source: 'fund_profiles',
    refreshedAt: '2026-03-24T10:00:00.000Z',
    warnings: ['Missing return fields are backfilled from historical NAV data when available.'],
  });
});

test('applies 3A, 6A, YTD, and 1Y filters after hydrating metric gaps', async () => {
  fromMock.mockReturnValue(createQueryMock([
    {
      fon_kodu: 'AAA',
      fon_kategorisi: 'Hisse',
      guncelleme_zamani: '2026-03-24T10:00:00.000Z',
    },
    {
      fon_kodu: 'BBB',
      fon_kategorisi: 'Hisse',
      guncelleme_zamani: '2026-03-24T09:00:00.000Z',
    },
  ]));
  hydrateFundMetricRows.mockResolvedValue([
    {
      fon_kodu: 'AAA',
      fon_kategorisi: 'Hisse',
      getiri_3a: 12,
      getiri_6a: 24,
      getiri_ytd: 8,
      getiri_1y: 30,
      guncelleme_zamani: '2026-03-24T10:00:00.000Z',
    },
    {
      fon_kodu: 'BBB',
      fon_kategorisi: 'Hisse',
      getiri_3a: 4,
      getiri_6a: 9,
      getiri_ytd: 2,
      getiri_1y: 7,
      guncelleme_zamani: '2026-03-24T09:00:00.000Z',
    },
  ]);

  const req = {
    query: {
      minGetiri3a: '5',
      minGetiri6a: '10',
      minGetiriYtd: '5',
      minGetiri1y: '10',
      fonKategorisi: 'Hisse',
    },
  };
  const res = createRes();

  await handler(req, res);

  expect(queryState.calls).toEqual(
    expect.arrayContaining([
      ['ilike', 'fon_kategorisi', '%Hisse%'],
    ])
  );
  expect(queryState.calls).not.toEqual(
    expect.arrayContaining([
      ['gte', 'getiri_3a', 5],
      ['gte', 'getiri_6a', 10],
      ['gte', 'getiri_ytd', 5],
      ['gte', 'getiri_1y', 10],
    ])
  );
  expect(res.payload.results.map((row) => row.fon_kodu)).toEqual(['AAA']);
});
