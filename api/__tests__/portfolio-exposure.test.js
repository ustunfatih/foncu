const resolveLatestCommonHoldingsPeriod = jest.fn();
jest.mock('../_lib/holdings-periods', () => ({
  resolveLatestCommonHoldingsPeriod: (...args) => resolveLatestCommonHoldingsPeriod(...args),
}));

jest.mock('../_lib/history', () => ({
  fetchLatestPriceBatch: jest.fn(),
}));

const queryMock = {
  select: jest.fn(() => queryMock),
  in: jest.fn(() => queryMock),
  eq: jest.fn(() => queryMock),
  then: (resolve) => resolve({ data: [], error: null }),
};

const fromMock = jest.fn(() => queryMock);
jest.mock('../_lib/supabase', () => ({
  from: (...args) => fromMock(...args),
}));

const handler = require('../portfolio');

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
  resolveLatestCommonHoldingsPeriod.mockReset();
  fromMock.mockClear();
  queryMock.select.mockClear();
  queryMock.in.mockClear();
  queryMock.eq.mockClear();
  resolveLatestCommonHoldingsPeriod.mockResolvedValue({ yil: 2026, ay: 3 });
});

test('returns 400 with row-level details for malformed exposure holdings', async () => {
  const req = {
    method: 'POST',
    query: { type: 'exposure' },
    body: {
      holdings: [
        { fundCode: '', shares: 1, currentValue: 10 },
        { fundCode: 'abc', shares: 0, currentValue: 10 },
        { fundCode: 'def', shares: 2, currentValue: -1 },
      ],
    },
  };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(400);
  expect(res.payload.error).toBe('Invalid holdings entries');
  expect(res.payload.details).toEqual([
    { index: 0, field: 'fundCode', message: 'fundCode must be a non-empty string' },
    { index: 1, field: 'shares', message: 'shares must be a finite number greater than 0' },
    { index: 2, field: 'currentValue', message: 'currentValue must be a finite number greater than or equal to 0' },
  ]);
});

test('returns 400 for NaN exposure inputs', async () => {
  const req = {
    method: 'POST',
    query: { type: 'exposure' },
    body: {
      holdings: [
        { fundCode: 'abc', shares: 1, currentValue: Number.NaN },
      ],
    },
  };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(400);
  expect(res.payload.details).toEqual([
    { index: 0, field: 'currentValue', message: 'currentValue must be a finite number greater than or equal to 0' },
  ]);
});

test('normalizes fundCode to uppercase before exposure queries', async () => {
  const req = {
    method: 'POST',
    query: { type: 'exposure' },
    body: {
      holdings: [
        { fundCode: ' abc ', shares: 1, currentValue: 100 },
      ],
    },
  };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(200);
  expect(resolveLatestCommonHoldingsPeriod).toHaveBeenCalledWith(['ABC']);
  expect(queryMock.in).toHaveBeenCalledWith('fon_kodu', ['ABC']);
});
