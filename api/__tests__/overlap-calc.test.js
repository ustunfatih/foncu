const { weightedJaccard, buildMatrix, groupByFund } = require('../_lib/overlap-calc');

describe('weightedJaccard', () => {
  test('returns 1.0 for identical holdings', () => {
    const a = { THYAO: 0.1, GARAN: 0.2 };
    const b = { THYAO: 0.1, GARAN: 0.2 };
    expect(weightedJaccard(a, b)).toBeCloseTo(1.0, 5);
  });

  test('returns 0 for completely different holdings', () => {
    const a = { THYAO: 0.5 };
    const b = { GARAN: 0.5 };
    expect(weightedJaccard(a, b)).toBe(0);
  });

  test('iterates over union, not just intersection', () => {
    // A holds THYAO 10%, B holds THYAO 10% and GARAN 10%
    // union = {THYAO, GARAN}
    // minSum = min(0.1,0.1) + min(0,0.1) = 0.1 + 0 = 0.1
    // maxSum = max(0.1,0.1) + max(0,0.1) = 0.1 + 0.1 = 0.2
    // jaccard = 0.1/0.2 = 0.5
    const a = { THYAO: 0.1 };
    const b = { THYAO: 0.1, GARAN: 0.1 };
    expect(weightedJaccard(a, b)).toBeCloseTo(0.5, 5);
  });

  test('handles empty funds', () => {
    expect(weightedJaccard({}, {})).toBe(0);
    expect(weightedJaccard({ THYAO: 0.1 }, {})).toBe(0);
  });
});

describe('buildMatrix', () => {
  const holdings = {
    AKB: { THYAO: 0.1, GARAN: 0.2 },
    GAF: { THYAO: 0.1, BIMAS: 0.15 },
  };

  test('is symmetric', () => {
    const matrix = buildMatrix(holdings);
    expect(matrix.AKB.GAF.pct).toBeCloseTo(matrix.GAF.AKB.pct, 5);
  });

  test('counts shared stocks correctly', () => {
    const matrix = buildMatrix(holdings);
    expect(matrix.AKB.GAF.sharedCount).toBe(1); // only THYAO shared
  });

  test('diagonal is not present', () => {
    const matrix = buildMatrix(holdings);
    expect(matrix.AKB.AKB).toBeUndefined();
  });
});

describe('groupByFund', () => {
  test('groups holdings rows into fund map with normalised weights', () => {
    const rows = [
      { fon_kodu: 'AKB', hisse_kodu: 'THYAO', yuzdesel_agirlik: 10 },
      { fon_kodu: 'AKB', hisse_kodu: 'GARAN', yuzdesel_agirlik: 20 },
      { fon_kodu: 'GAF', hisse_kodu: 'THYAO', yuzdesel_agirlik: 8 },
    ];
    const result = groupByFund(rows);
    expect(result.AKB.THYAO).toBeCloseTo(0.1, 5);
    expect(result.AKB.GARAN).toBeCloseTo(0.2, 5);
    expect(result.GAF.THYAO).toBeCloseTo(0.08, 5);
  });
});
