const { computeRsi14, computeSma, rsiToSignal } = require('../_lib/sync-helpers');

describe('computeSma', () => {
  test('returns null when insufficient data', () => {
    expect(computeSma([1, 2], 5)).toBeNull();
  });

  test('computes SMA of last N prices', () => {
    const prices = [10, 20, 30, 40, 50];
    expect(computeSma(prices, 3)).toBeCloseTo(40, 5); // (30+40+50)/3
  });

  test('returns exact value when prices.length === period', () => {
    expect(computeSma([10, 20, 30], 3)).toBeCloseTo(20, 5);
  });
});

describe('computeRsi14', () => {
  test('returns null with fewer than 15 prices', () => {
    expect(computeRsi14(Array(14).fill(100))).toBeNull();
  });

  test('returns 100 when all prices increase', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(computeRsi14(prices)).toBe(100);
  });

  test('returns value between 0 and 100', () => {
    const prices = [10, 12, 11, 13, 12, 14, 13, 11, 12, 10, 11, 13, 12, 14, 15, 13, 14];
    const rsi = computeRsi14(prices);
    expect(rsi).toBeGreaterThan(0);
    expect(rsi).toBeLessThan(100);
  });
});

describe('rsiToSignal', () => {
  test.each([
    [24, 'guclu_al'],
    [30, 'al'],
    [40, 'dikkat'],
    [60, 'normal'],
    [null, 'normal'],
  ])('rsi %s → %s', (rsi, expected) => {
    expect(rsiToSignal(rsi)).toBe(expected);
  });
});
