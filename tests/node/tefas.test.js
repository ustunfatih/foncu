const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDate } = require('../../api/_lib/tefas');

test('formatDate works with Date object', () => {
  const date = new Date(2023, 0, 1); // January 1, 2023
  const formatted = formatDate(date);
  assert.equal(formatted, '01.01.2023');
});

test('formatDate works with string input', () => {
  // Using T12:00:00 ensures it is treated as local time
  const input = '2023-10-05T12:00:00';
  const formatted = formatDate(input);
  assert.equal(formatted, '05.10.2023');
});

test('formatDate works with timestamp', () => {
  // Construct a timestamp that represents Jan 1st 2023 in local time
  const timestamp = new Date(2023, 0, 1).getTime();
  const formatted = formatDate(timestamp);
  assert.equal(formatted, '01.01.2023');
});

test('formatDate pads single digit day and month', () => {
  const date = new Date(2023, 8, 5); // September 5, 2023
  const formatted = formatDate(date);
  assert.equal(formatted, '05.09.2023');
});
