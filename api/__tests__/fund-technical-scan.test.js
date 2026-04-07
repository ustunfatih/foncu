const queryState = { calls: [] };

function createQueryMock(responseRows = []) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn((...args) => {
      queryState.calls.push(['eq', ...args]);
      return query;
    }),
    not: jest.fn((...args) => {
      queryState.calls.push(['not', ...args]);
      return query;
    }),
    lte: jest.fn((...args) => {
      queryState.calls.push(['lte', ...args]);
      return query;
    }),
    order: jest.fn((...args) => {
      queryState.calls.push(['order', ...args]);
      return query;
    }),
    limit: jest.fn((...args) => {
      queryState.calls.push(['limit', ...args]);
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

const handler = require('../fund-technical-scan');

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
  fromMock.mockReset();
  queryState.calls = [];
});

test('uses canonical rsiThreshold when provided', async () => {
  fromMock.mockReturnValue(createQueryMock([{ fon_kodu: 'AAA', unvan: 'Alpha' }]));
  const req = { query: { mode: 'rsi', rsiThreshold: '28' } };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(200);
  expect(queryState.calls).toEqual(expect.arrayContaining([['lte', 'rsi_14', 28]]));
});

test('supports deprecated rsiBelow and sets deprecation headers', async () => {
  fromMock.mockReturnValue(createQueryMock([{ fon_kodu: 'AAA', unvan: 'Alpha' }]));
  const req = { query: { mode: 'rsi', rsiBelow: '27' } };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(200);
  expect(queryState.calls).toEqual(expect.arrayContaining([['lte', 'rsi_14', 27]]));
  expect(res.headers.Deprecation).toBe('true');
  expect(res.headers.Sunset).toBe('2026-07-01');
});

test('returns 400 for invalid threshold', async () => {
  const req = { query: { mode: 'rsi', rsiThreshold: 'abc' } };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(400);
  expect(res.payload.error).toContain('rsiThreshold');
});

test('maps response using canonical scan fields', async () => {
  fromMock.mockReturnValue(createQueryMock([
    {
      fon_kodu: 'AAA',
      unvan: 'Alpha Fund',
      portfoy_yonetim_sirketi: 'Manager A',
      rsi_14: 24.1,
      rsi_sinyal: 'oversold',
      sma_20: 100,
      sma_50: 95,
      sma_200: 80,
      son_fiyat: 102,
      ma200_ustu: true,
      sma_kesisim_20_50: true,
      getiri_1a: 4.3,
      getiri_1y: 20.2,
      risk_seviyesi: 5,
    },
  ]));

  const req = { query: { mode: 'rsi' } };
  const res = createRes();

  await handler(req, res);

  expect(res.payload.results[0]).toEqual({
    code: 'AAA',
    title: 'Alpha Fund',
    manager: 'Manager A',
    rsi: 24.1,
    rsiSignal: 'oversold',
    sma20: 100,
    sma50: 95,
    sma200: 80,
    price: 102,
    aboveMa200: true,
    smaCrossover: true,
    return1m: 4.3,
    return1y: 20.2,
    riskLevel: 5,
  });
});
