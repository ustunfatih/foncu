jest.mock('../_lib/supabase', () => ({
  from: jest.fn(),
}));

const fetchLatestPriceBatch = jest.fn();
jest.mock('../_lib/history', () => ({
  fetchLatestPriceBatch: (...args) => fetchLatestPriceBatch(...args),
}));

jest.mock('../_lib/holdings-periods', () => ({
  resolveLatestCommonHoldingsPeriod: jest.fn(),
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
  fetchLatestPriceBatch.mockReset();
  fetchLatestPriceBatch.mockResolvedValue({
    AAA: { value: 12.5, date: '2026-03-01' },
  });
});

test('returns 400 with row-level details for malformed valuation holdings', async () => {
  const req = {
    method: 'POST',
    query: { type: 'valuation' },
    body: {
      holdings: [
        { code: '', shares: 1, cost: 1 },
        { code: 'aaa', shares: 0, cost: 10 },
        { code: 'bbb', shares: 2, cost: -1 },
      ],
    },
  };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(400);
  expect(res.payload.error).toBe('Invalid holdings entries');
  expect(res.payload.details).toEqual([
    { index: 0, field: 'code', message: 'code must be a non-empty string' },
    { index: 1, field: 'shares', message: 'shares must be a finite number greater than 0' },
    { index: 2, field: 'cost', message: 'cost must be a finite number greater than or equal to 0' },
  ]);
});

test('returns 400 for NaN valuation inputs', async () => {
  const req = {
    method: 'POST',
    query: { type: 'valuation' },
    body: {
      holdings: [
        { code: 'aaa', shares: Number.NaN, cost: 10 },
      ],
    },
  };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(400);
  expect(res.payload.details).toEqual([
    { index: 0, field: 'shares', message: 'shares must be a finite number greater than 0' },
  ]);
});

test('normalizes code to uppercase before valuation lookup', async () => {
  const req = {
    method: 'POST',
    query: { type: 'valuation' },
    body: {
      holdings: [
        { code: ' aaa ', shares: 2, cost: 10 },
      ],
    },
  };
  const res = createRes();

  await handler(req, res);

  expect(res.statusCode).toBe(200);
  expect(fetchLatestPriceBatch).toHaveBeenCalledWith(['AAA']);
  expect(res.payload.holdings[0].code).toBe('AAA');
});
