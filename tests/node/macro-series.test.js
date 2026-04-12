const { test, describe, afterEach, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

describe('macro-series handler', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    // Clear require cache to ensure fresh module load
    delete require.cache[require.resolve('../../api/macro-series.js')];
  });

  afterEach(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
    mock.restoreAll();
  });

  const createMockRes = () => {
    const res = {
      statusCode: 200,
      data: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.data = data;
        return this;
      },
    };
    return res;
  };

  test('should return 200 and data from exchangerate.host on success', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        rates: {
          '2024-01-01': { TRY: 30.1 },
          '2024-01-02': { TRY: 30.2 },
        },
      }),
    };
    global.fetch = mock.fn(async () => mockResponse);

    const handler = require('../../api/macro-series.js');
    const req = { query: { symbol: 'USDTRY', days: '2' } };
    const res = createMockRes();

    await handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.symbol, 'USDTRY');
    assert.strictEqual(res.data.source, 'exchangerate.host');
    assert.strictEqual(res.data.series.length, 2);
    assert.strictEqual(res.data.series[0].date, '2024-01-01');
    assert.strictEqual(res.data.series[0].value, 30.1);
  });

  test('should fallback to frankfurter.app if exchangerate.host returns no data', async () => {
    const fetchMock = mock.fn(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes('exchangerate.host')) {
        return {
          ok: true,
          json: async () => ({ rates: {} }),
        };
      }
      if (urlStr.includes('frankfurter.app')) {
        return {
          ok: true,
          json: async () => ({
            rates: {
              '2024-01-01': { TRY: 30.5 },
            },
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    global.fetch = fetchMock;

    const handler = require('../../api/macro-series.js');
    const req = { query: { symbol: 'USDTRY' } };
    const res = createMockRes();

    await handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.source, 'frankfurter.app');
    assert.strictEqual(res.data.series.length, 1);
    assert.strictEqual(res.data.series[0].value, 30.5);
    assert.ok(fetchMock.mock.calls.length >= 2, 'Should be called at least twice');
  });

  test('should return 400 for unsupported symbol', async () => {
    const handler = require('../../api/macro-series.js');
    const req = { query: { symbol: 'INVALID' } };
    const res = createMockRes();

    await handler(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.error, 'Unsupported symbol');
  });

  test('should return 500 when fetch fails', async () => {
    global.fetch = mock.fn(async () => ({
      ok: false,
      status: 500,
    }));

    const handler = require('../../api/macro-series.js');
    const req = { query: { symbol: 'USDTRY' } };
    const res = createMockRes();

    await handler(req, res);

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.data.error, 'Failed to load macro series');
  });

  test('should return 500 when an unexpected error occurs', async () => {
    // Force an error by passing a null req, which will fail when accessing req.query
    const handler = require('../../api/macro-series.js');
    const res = createMockRes();

    await handler(null, res);

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.data.error, 'Failed to load macro series');
  });
});
