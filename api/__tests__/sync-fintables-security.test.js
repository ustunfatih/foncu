// We need to mock supabase BEFORE requiring any module that uses it
jest.mock('../_lib/supabase', () => ({
  createClient: jest.fn().mockReturnValue({}),
}));

// Mock all dependencies to avoid side effects during sync
jest.mock('../_lib/providers/fund-profiles-provider', () => ({
  syncFundProfiles: jest.fn().mockResolvedValue({ profiles: [], profileCount: 0 }),
  syncFundAllocations: jest.fn().mockResolvedValue({ allocationCount: 0 }),
}));
jest.mock('../_lib/providers/fund-metrics-provider', () => ({
  syncFundMetrics: jest.fn().mockResolvedValue({ metricCount: 0, coverage: {} }),
}));
jest.mock('../_lib/providers/fund-history-provider', () => ({
  backfillMissingMetricHistory: jest.fn().mockResolvedValue({}),
}));
jest.mock('../_lib/providers/fund-holdings-provider', () => ({
  syncFundHoldings: jest.fn().mockResolvedValue({}),
  syncKapEvents: jest.fn().mockResolvedValue({}),
}));
jest.mock('../_lib/cache', () => ({
  invalidateCacheByPrefix: jest.fn(),
}));

function createRes() {
  const res = {
    statusCode: 200,
    status: jest.fn().mockImplementation((code) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn().mockImplementation((payload) => {
      res.payload = payload;
      return res;
    }),
  };
  return res;
}

describe('sync-fintables security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('allows access with correct Bearer token', async () => {
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret-123' };
    const handler = require('../sync-fintables');
    const req = {
      headers: { authorization: 'Bearer test-secret-123' },
      query: {},
    };
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  test('allows access with correct query parameter', async () => {
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret-123' };
    const handler = require('../sync-fintables');
    const req = {
      headers: {},
      query: { secret: 'test-secret-123' },
    };
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  test('denies access with incorrect Bearer token', async () => {
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret-123' };
    const handler = require('../sync-fintables');
    const req = {
      headers: { authorization: 'Bearer wrong-secret' },
      query: {},
    };
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.payload.error).toBe('Unauthorized');
  });

  test('denies access with incorrect query parameter', async () => {
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret-123' };
    const handler = require('../sync-fintables');
    const req = {
      headers: {},
      query: { secret: 'wrong-secret' },
    };
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.payload.error).toBe('Unauthorized');
  });

  test('denies access with missing credentials', async () => {
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret-123' };
    const handler = require('../sync-fintables');
    const req = {
      headers: {},
      query: {},
    };
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  test('denies access when CRON_SECRET is not set', async () => {
    process.env = { ...originalEnv, CRON_SECRET: '' };
    const handler = require('../sync-fintables');
    const req = {
      headers: { authorization: 'Bearer any' },
      query: { secret: 'any' },
    };
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });
});
