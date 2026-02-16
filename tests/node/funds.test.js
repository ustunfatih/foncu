const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

test('GET /api/funds returns funds list', async () => {
  // Save original require
  const originalRequire = Module.prototype.require;

  // Mock dependencies
  Module.prototype.require = function(id) {
    if (id.includes('_lib/tefas')) {
      return {
        bootstrapSession: async () => 'mock-cookie',
        fetchInfo: async () => [
          { FONKODU: 'ABC', FONUNVAN: 'ABC Fund', TARIH: '1737504000000' },
          { FONKODU: 'DEF', FONUNVAN: 'DEF Fund', TARIH: '1737504000000' }
        ],
        formatDate: () => '01.01.2024',
        toISO: () => '2024-01-01',
      };
    }
    if (id.includes('_lib/supabase')) {
      return null; // Mock Supabase as null
    }
    return originalRequire.call(this, id);
  };

  try {
    // Clear cache to ensure we get a fresh module with our mocks
    // We need to resolve the path relative to this file
    const fundsPath = require.resolve('../../api/funds');
    delete require.cache[fundsPath];

    const handler = require('../../api/funds');

    const req = { query: { kind: 'YAT' } };
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.statusCode = code; return this; },
      json(data) { this.data = data; return this; }
    };

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.funds.length, 2);
    assert.equal(res.data.funds[0].code, 'ABC');

  } finally {
    // Restore original require
    Module.prototype.require = originalRequire;
  }
});
