const test = require('node:test');
const assert = require('node:assert/strict');

// Mock dependencies before requiring the handler
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
  if (path === '@supabase/supabase-js') {
    return {
      createClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null })
                })
              })
            })
          })
        })
      })
    };
  }
  if (path === 'dotenv') {
    return {
      config: () => ({})
    };
  }
  return originalRequire.apply(this, arguments);
};

// Set environment variables
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';

const handler = require('../../api/portfolio-valuation');

test('portfolio-valuation handler returns 400 for invalid JSON body', async () => {
  const req = {
    method: 'POST',
    body: '{ invalid json }'
  };

  let statusCode;
  let responseBody;

  const res = {
    status: function(code) {
      statusCode = code;
      return this;
    },
    json: function(data) {
      responseBody = data;
      return this;
    }
  };

  await handler(req, res);

  assert.strictEqual(statusCode, 400, 'Should return 400 Bad Request');
  assert.strictEqual(responseBody.error, 'Invalid JSON body', 'Should return "Invalid JSON body" error message');
});

test('portfolio-valuation handler returns 405 for non-POST methods', async () => {
  const req = {
    method: 'GET'
  };

  let statusCode;
  let responseBody;

  const res = {
    status: function(code) {
      statusCode = code;
      return this;
    },
    json: function(data) {
      responseBody = data;
      return this;
    }
  };

  await handler(req, res);

  assert.strictEqual(statusCode, 405, 'Should return 405 Method Not Allowed');
  assert.strictEqual(responseBody.error, 'Method not allowed');
});

test('portfolio-valuation handler returns 400 for empty holdings', async () => {
  const req = {
    method: 'POST',
    body: { holdings: [] }
  };

  let statusCode;
  let responseBody;

  const res = {
    status: function(code) {
      statusCode = code;
      return this;
    },
    json: function(data) {
      responseBody = data;
      return this;
    }
  };

  await handler(req, res);

  assert.strictEqual(statusCode, 400);
  assert.strictEqual(responseBody.error, 'Holdings must be a non-empty array');
});
