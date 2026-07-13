const {
  buildBusinessDates,
  defaultStartDate,
  findLargestGapDays,
  parseArgs,
} = require('../../scripts/backfill-tefas-history');

test('defaults to the full five-year history window', () => {
  expect(defaultStartDate('2026-07-13')).toBe('2021-07-14');
  expect(parseArgs(['--end-date', '2026-07-13'])).toMatchObject({
    startDate: '2021-07-14',
    endDate: '2026-07-13',
    kinds: ['YAT', 'EMK', 'BYF'],
  });
});

test('bulk backfill skips weekends', () => {
  expect(buildBusinessDates('2026-07-10', '2026-07-14')).toEqual([
    '2026-07-10',
    '2026-07-13',
    '2026-07-14',
  ]);
});

test('coverage verification detects large internal gaps', () => {
  expect(findLargestGapDays([
    { date: '2026-04-10' },
    { date: '2026-04-13' },
    { date: '2026-07-13' },
  ])).toBe(91);
});

test('focused runs use the requested fund kind and verification code', () => {
  expect(parseArgs([
    '--start-date', '2026-04-01',
    '--end-date', '2026-07-13',
    '--fund-code', 'tly',
    '--kind', 'yat',
  ])).toMatchObject({
    fundCode: 'TLY',
    kinds: ['YAT'],
    verifyCodes: ['TLY'],
  });
});
