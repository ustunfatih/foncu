jest.mock('../_lib/cache', () => ({
  TTL: { FUND_SCREEN: 1234 },
  createCacheKey: jest.fn(() => 'fund-screen:test'),
  getOrSetCache: jest.fn(async (_key, _ttl, loader) => ({ value: await loader(), cached: false })),
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
    warnings: ['Filtered queries exclude funds whose requested metric is unavailable.'],
  });
});

test('adds explicit null exclusion for YTD and 1Y filters', async () => {
  fromMock.mockReturnValue(createQueryMock([]));

  const req = {
    query: {
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
      ['not', 'getiri_ytd', 'is', null],
      ['gte', 'getiri_ytd', 5],
      ['not', 'getiri_1y', 'is', null],
      ['gte', 'getiri_1y', 10],
    ])
  );
});
