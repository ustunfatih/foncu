const { resolveApiRoute } = require('../../api-server');

describe('api-server route validation', () => {
  test.each([
    ['/../funds'],
    ['/..%2Ffunds'],
    ['/./funds'],
    ['/funds/extra'],
    ['/funds\\extra'],
    ['/.env']
  ])('rejects traversal or malformed route payload: %s', (route) => {
    const result = resolveApiRoute(route);
    expect(result.error).toBe(400);
  });

  test('returns 404 for unknown route', () => {
    const result = resolveApiRoute('/unknown-route');
    expect(result.error).toBe(404);
  });

  test('resolves allowlisted route', () => {
    const result = resolveApiRoute('/funds');
    expect(result.error).toBeUndefined();
    expect(typeof result.handler).toBe('function');
  });
});
