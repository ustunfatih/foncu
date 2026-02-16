const { test, describe, afterEach, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

describe('market-events handler', () => {
  let originalEnv;
  let originalFetch;

  beforeEach(() => {
    originalEnv = process.env;
    originalFetch = global.fetch;
    process.env = { ...originalEnv, TRADING_ECONOMICS_KEY: 'test-key' };

    // Clear require cache to ensure fresh module load
    delete require.cache[require.resolve('../../api/market-events.js')];
  });

  afterEach(() => {
    process.env = originalEnv;
    if (originalFetch) {
        global.fetch = originalFetch;
    } else {
        delete global.fetch;
    }
    mock.restoreAll();
  });

  test('should cache external API response and set headers', async (t) => {
    // Mock fetch
    const fetchMock = mock.fn(async () => {
      return {
        ok: true,
        json: async () => ([
          { Date: '2023-10-27T10:00:00', Country: 'US', Event: 'GDP', Importance: 'High', Actual: '2.5%' }
        ])
      };
    });
    global.fetch = fetchMock;

    const handler = require('../../api/market-events.js');

    // First request
    const req1 = { query: {} };
    const res1 = {
      headers: {},
      status: (code) => ({ json: (data) => ({ code, data }) }),
      setHeader: (key, value) => { res1.headers[key] = value; }
    };

    await handler(req1, res1);

    // Second request
    const req2 = { query: {} };
    const res2 = {
      headers: {},
      status: (code) => ({ json: (data) => ({ code, data }) }),
      setHeader: (key, value) => { res2.headers[key] = value; }
    };

    await handler(req2, res2);

    // Verify fetch called only once
    assert.equal(fetchMock.mock.calls.length, 1, 'fetch should be called exactly once');

    // Verify Cache-Control header
    assert.ok(res1.headers['Cache-Control'], 'Cache-Control header should be present');
    assert.match(res1.headers['Cache-Control'], /s-maxage=3600/, 'Cache-Control should have s-maxage=3600 directive');
  });
});
