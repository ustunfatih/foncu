const from = jest.fn();

jest.mock('../_lib/supabase', () => ({
  from: (...args) => from(...args),
}));

const {
  buildPeriodKey,
  dedupePeriods,
  resolveLatestCommonHoldingsPeriod,
} = require('../_lib/holdings-periods');

function createQuery(rows, error = null) {
  return {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: rows, error }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('buildPeriodKey pads months', () => {
  expect(buildPeriodKey(2026, 3)).toBe('2026-03');
});

test('dedupePeriods keeps unique periods in descending order', () => {
  expect(dedupePeriods([
    { rapor_yil: 2026, rapor_ay: 2 },
    { rapor_yil: 2026, rapor_ay: 3 },
    { rapor_yil: 2026, rapor_ay: 3 },
    { rapor_yil: 2025, rapor_ay: 12 },
  ])).toEqual([
    { yil: 2026, ay: 3 },
    { yil: 2026, ay: 2 },
    { yil: 2025, ay: 12 },
  ]);
});

test('resolveLatestCommonHoldingsPeriod returns the latest common month across funds', async () => {
  from.mockReturnValue(createQuery([
    { fon_kodu: 'AAA', rapor_yil: 2026, rapor_ay: 3 },
    { fon_kodu: 'AAA', rapor_yil: 2026, rapor_ay: 2 },
    { fon_kodu: 'BBB', rapor_yil: 2026, rapor_ay: 2 },
    { fon_kodu: 'BBB', rapor_yil: 2026, rapor_ay: 1 },
  ]));

  await expect(resolveLatestCommonHoldingsPeriod(['AAA', 'BBB'])).resolves.toEqual({
    yil: 2026,
    ay: 2,
  });
});

test('resolveLatestCommonHoldingsPeriod returns null when no common month exists', async () => {
  from.mockReturnValue(createQuery([
    { fon_kodu: 'AAA', rapor_yil: 2026, rapor_ay: 3 },
    { fon_kodu: 'BBB', rapor_yil: 2026, rapor_ay: 2 },
  ]));

  await expect(resolveLatestCommonHoldingsPeriod(['AAA', 'BBB'])).resolves.toBeNull();
});
