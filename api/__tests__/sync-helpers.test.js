const {
  buildCoverageStats,
  buildMetricSnapshot,
  computeReturnSinceDate,
  computeRsi14,
  computeSma,
  computeSmaCrossover,
  computeYtdReturn,
  findRowBefore,
  findRowOnOrBefore,
  normalizeHistoryRows,
  rsiToSignal,
} = require('../_lib/sync-helpers');

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

describe('history helpers', () => {
  const rows = normalizeHistoryRows([
    { date: '2025-12-30', price: 100 },
    { date: '2025-12-31', price: 110 },
    { date: '2026-01-02', price: 120 },
    { date: '2026-01-05', price: 130 },
  ]);

  test('normalizes and sorts history rows', () => {
    expect(rows.map((row) => row.date)).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-02',
      '2026-01-05',
    ]);
  });

  test('finds row on or before target date', () => {
    expect(findRowOnOrBefore(rows, '2026-01-04').date).toBe('2026-01-02');
  });

  test('finds row strictly before target date', () => {
    expect(findRowBefore(rows, '2026-01-01').date).toBe('2025-12-31');
  });

  test('computes return since nearest prior date', () => {
    expect(computeReturnSinceDate(rows, '2025-12-31')).toBeCloseTo(18.1818, 4);
  });

  test('computes YTD using last close before year start', () => {
    expect(computeYtdReturn(rows, new Date('2026-01-05T00:00:00Z'))).toBeCloseTo(18.1818, 4);
  });
});

describe('buildMetricSnapshot', () => {
  const rows = [];
  let price = 100;
  for (let day = 0; day < 420; day += 1) {
    rows.push({
      date: new Date(Date.UTC(2025, 0, 1 + day)).toISOString().slice(0, 10),
      price,
    });
    price += 1;
  }

  test('builds the full screener metric snapshot', () => {
    const metrics = buildMetricSnapshot(rows, new Date('2026-02-28T00:00:00Z'));
    expect(metrics.son_fiyat).toBe(519);
    expect(metrics.getiri_1g).not.toBeNull();
    expect(metrics.getiri_1h).not.toBeNull();
    expect(metrics.getiri_1a).not.toBeNull();
    expect(metrics.getiri_3a).not.toBeNull();
    expect(metrics.getiri_6a).not.toBeNull();
    expect(metrics.getiri_ytd).not.toBeNull();
    expect(metrics.getiri_1y).not.toBeNull();
    expect(metrics.sma_20).not.toBeNull();
    expect(metrics.sma_50).not.toBeNull();
    expect(metrics.sma_200).not.toBeNull();
    expect(typeof metrics.sma_kesisim_20_50).toBe('boolean');
  });

  test('returns nulls when there is not enough history', () => {
    const metrics = buildMetricSnapshot(rows.slice(0, 5), new Date('2025-01-05T00:00:00Z'));
    expect(metrics.getiri_1h).toBeNull();
    expect(metrics.getiri_1a).toBeNull();
    expect(metrics.getiri_1y).toBeNull();
    expect(metrics.sma_200).toBeNull();
  });
});

describe('computeSmaCrossover', () => {
  test('returns false when there is not enough history', () => {
    expect(computeSmaCrossover([1, 2, 3, 4], 2, 3, 2)).toBe(false);
  });
});

describe('buildCoverageStats', () => {
  test('summarizes populated metric coverage', () => {
    const stats = buildCoverageStats([
      { son_fiyat: 1, getiri_1h: 1, getiri_ytd: 1, getiri_1y: null, sma_200: null },
      { son_fiyat: null, getiri_1h: null, getiri_ytd: null, getiri_1y: 2, sma_200: 100 },
    ]);

    expect(stats).toEqual({
      totalFundsRefreshed: 2,
      fundsWithYtd: 1,
      fundsWith1Y: 1,
      fundsWithSma200: 1,
      fundsWith1H: 1,
      fundsMissingHistory: 1,
    });
  });
});

describe('rsiToSignal', () => {
  test.each([
    [24, 'guclu_al'],
    [30, 'al'],
    [40, 'dikkat'],
    [60, 'normal'],
    [null, null],
  ])('rsi %s → %s', (rsi, expected) => {
    expect(rsiToSignal(rsi)).toBe(expected);
  });
});
