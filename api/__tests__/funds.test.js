jest.mock('../_lib/cache', () => ({
  TTL: { FUND_MASTER: 1234 },
  createCacheKey: jest.fn(() => 'funds:test'),
  getOrSetCache: jest.fn(async (_key, _ttl, loader) => ({ value: await loader(), cached: false })),
}));

const state = { eqCalls: [], rangeCalls: [] };
const fromMock = jest.fn();

function createQueryMock(pages) {
  let pageIndex = 0;

  const query = {
    select: jest.fn(() => query),
    eq: jest.fn((...args) => {
      state.eqCalls.push(args);
      return query;
    }),
    order: jest.fn(() => query),
    range: jest.fn((from, to) => {
      state.rangeCalls.push([from, to]);
      return Promise.resolve({ data: pages[pageIndex++] || [], error: null });
    }),
  };

  return query;
}

jest.mock('../_lib/supabase', () => ({
  from: (...args) => fromMock(...args),
}));

const handler = require('../funds');

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
  state.eqCalls = [];
  state.rangeCalls = [];
  fromMock.mockReset();
});

test('returns the full TEFAS-active YAT fund universe across multiple pages', async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    fon_kodu: `A${String(index).padStart(3, '0')}`,
    unvan: `Fund ${index}`,
    guncelleme_zamani: '2026-04-07T10:00:00.000Z',
  }));
  const secondPage = [
    {
      fon_kodu: 'PHE',
      unvan: 'PUSULA PORTFOY HISSE SENEDI FONU',
      guncelleme_zamani: '2026-04-07T12:00:00.000Z',
    },
    {
      fon_kodu: 'TLY',
      unvan: 'TERA PORTFOY BIRINCI SERBEST FON',
      guncelleme_zamani: '2026-04-07T13:00:00.000Z',
    },
  ];

  fromMock.mockReturnValue(createQueryMock([firstPage, secondPage]));

  const req = { query: { kind: 'YAT' } };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(200);
  expect(res.payload.funds).toHaveLength(1002);
  expect(res.payload.funds.slice(-2).map((fund) => fund.code)).toEqual(['PHE', 'TLY']);
  expect(state.eqCalls).toEqual(
    expect.arrayContaining([
      ['fon_tipi', 'mutual'],
      ['tefasa_acik', true],
    ])
  );
  expect(state.rangeCalls).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
});

test('does not require tefasa_acik when listing non-YAT funds', async () => {
  fromMock.mockReturnValue(createQueryMock([[
    {
      fon_kodu: 'EM1',
      unvan: 'Pension Fund',
      guncelleme_zamani: '2026-04-07T09:00:00.000Z',
    },
  ]]));

  const req = { query: { kind: 'EMK' } };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(200);
  expect(res.payload.funds).toHaveLength(1);
  expect(state.eqCalls).toEqual(
    expect.arrayContaining([
      ['fon_tipi', 'pension'],
    ])
  );
  expect(state.eqCalls).not.toEqual(
    expect.arrayContaining([
      ['tefasa_acik', true],
    ])
  );
});
