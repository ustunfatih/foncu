const from = jest.fn();

jest.mock('../_lib/supabase', () => ({ from: (...args) => from(...args) }));
const health = require('../_lib/health');

function res() {
  return {
    headers: {}, statusCode: 200,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('reports database reachability and freshness without secrets', async () => {
  const query = {
    select: jest.fn(() => query), order: jest.fn(() => query), limit: jest.fn(() => query),
    maybeSingle: jest.fn().mockResolvedValue({ data: { guncelleme_zamani: new Date().toISOString() }, error: null }),
  };
  from.mockReturnValue(query);
  const response = res();
  await health({}, response);
  expect(response.statusCode).toBe(200);
  expect(response.payload.status).toBe('healthy');
  expect(JSON.stringify(response.payload)).not.toContain('SERVICE_ROLE');
});
