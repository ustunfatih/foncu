const test = require('node:test');
const assert = require('node:assert/strict');
const { toISO } = require('../../api/_lib/tefas');

test('toISO converts numeric timestamp to YYYY-MM-DD', () => {
  // 2024-01-01 00:00:00 UTC = 1704067200000
  const timestamp = 1704067200000;
  assert.equal(toISO(timestamp), '2024-01-01');
});

test('toISO converts string timestamp to YYYY-MM-DD', () => {
  // 2023-12-31 00:00:00 UTC = 1703980800000
  const timestamp = '1703980800000';
  assert.equal(toISO(timestamp), '2023-12-31');
});

test('toISO handles single digit month and day correctly', () => {
  // 2024-05-05 00:00:00 UTC = 1714867200000
  const timestamp = 1714867200000;
  assert.equal(toISO(timestamp), '2024-05-05');
});

test('toISO handles leap year', () => {
  // 2024-02-29 00:00:00 UTC = 1709164800000
  const timestamp = 1709164800000;
  assert.equal(toISO(timestamp), '2024-02-29');
});

test('toISO handles end of year', () => {
  // 2023-12-31 00:00:00 UTC = 1703980800000
  const timestamp = 1703980800000;
  assert.equal(toISO(timestamp), '2023-12-31');
});
