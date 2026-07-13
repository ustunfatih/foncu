const {
  buildBusinessDates,
  defaultStartDate,
  filterToKnownFunds,
  findLargestGapDays,
  parseArgs,
} = require('../../scripts/backfill-tefas-history');

test('rows for delisted fund codes are dropped to satisfy the funds FK', () => {
  const dropped = new Set();
  const rows = [
    { fund_code: 'AAL', date: '2021-08-02', price: 1 },
    { fund_code: 'DEAD', date: '2021-08-02', price: 2 },
  ];
  expect(filterToKnownFunds(rows, new Set(['AAL']), dropped)).toEqual([rows[0]]);
  expect([...dropped]).toEqual(['DEAD']);
});

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
