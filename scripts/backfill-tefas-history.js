#!/usr/bin/env node

require('dotenv').config();

const supabase = require('../api/_lib/supabase');
const { bootstrapSession, fetchInfo } = require('../api/_lib/tefas');
const {
  FULL_HISTORY_LOOKBACK_DAYS,
  TEFAS_MAX_RANGE_DAYS,
  buildDateChunks,
  buildHistoricalUpsertRows,
} = require('../api/_lib/providers/fund-history-provider');
const { upsertRows } = require('../api/_lib/sync-helpers');

const FUND_KINDS = ['YAT', 'EMK', 'BYF'];
const DEFAULT_VERIFY_CODES = ['TLY', 'PHE', 'DFI', 'PBR'];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function toIsoDate(value, label) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must use YYYY-MM-DD format`);
  }
  return value;
}

function defaultStartDate(endDate) {
  const start = new Date(`${endDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - FULL_HISTORY_LOOKBACK_DAYS);
  return start.toISOString().slice(0, 10);
}

function buildBusinessDates(startDate, endDate) {
  const dates = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  while (current <= end) {
    const weekday = current.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      dates.push(current.toISOString().slice(0, 10));
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    values[key] = value;
    index += 1;
  }

  const endDate = toIsoDate(values['end-date'] || new Date().toISOString().slice(0, 10), 'end-date');
  const startDate = toIsoDate(values['start-date'] || defaultStartDate(endDate), 'start-date');
  if (startDate > endDate) throw new Error('start-date must be on or before end-date');

  const fundCode = (values['fund-code'] || '').trim().toUpperCase();
  const kinds = values.kind ? [values.kind.trim().toUpperCase()] : FUND_KINDS;
  if (kinds.some((kind) => !FUND_KINDS.includes(kind))) {
    throw new Error(`kind must be one of ${FUND_KINDS.join(', ')}`);
  }

  const cooldownMs = Number(values['cooldown-ms'] || 1500);
  const batchSize = Number(values['batch-size'] || 500);
  const maxGapDays = Number(values['max-gap-days'] || 14);
  if (!Number.isInteger(cooldownMs) || cooldownMs < 0) throw new Error('cooldown-ms must be a non-negative integer');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error('batch-size must be between 1 and 1000');
  if (!Number.isInteger(maxGapDays) || maxGapDays < 1) throw new Error('max-gap-days must be a positive integer');

  const verifyCodes = (values['verify-codes'] || (fundCode || DEFAULT_VERIFY_CODES.join(',')))
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);

  return { startDate, endDate, fundCode, kinds, cooldownMs, batchSize, maxGapDays, verifyCodes };
}

// historical_data.fund_code has an FK to funds.code; old TEFAS snapshots
// contain delisted codes that would abort the whole upsert.
async function loadKnownFundCodes() {
  const codes = new Set();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('funds')
      .select('code')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to load fund codes: ${error.message}`);
    for (const row of data || []) codes.add(row.code);
    if ((data || []).length < pageSize) break;
  }
  return codes;
}

function filterToKnownFunds(rows, knownCodes, droppedCodes) {
  return rows.filter((row) => {
    if (knownCodes.has(row.fund_code)) return true;
    droppedCodes.add(row.fund_code);
    return false;
  });
}

async function fetchWithRateLimitRetry(params, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchInfo(params);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delay = Math.min(60_000, 5_000 * (2 ** (attempt - 1)));
      console.warn(`[history-backfill] ${error.message}; retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function upsertInBatches(rows, batchSize) {
  let upserted = 0;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { count } = await upsertRows('historical_data', batch, 'fund_code,date');
    upserted += count ?? batch.length;
  }
  return upserted;
}

async function backfillFocusedFund(options, cookie, knownCodes) {
  if (!knownCodes.has(options.fundCode)) {
    throw new Error(
      `${options.fundCode} is not present in the funds table; run the nightly sync first so the FK on historical_data can be satisfied`
    );
  }

  const droppedCodes = new Set();
  let requestCount = 0;
  let upsertedCount = 0;
  for (const chunk of buildDateChunks(options.startDate, options.endDate, TEFAS_MAX_RANGE_DAYS)) {
    const rows = await fetchWithRateLimitRetry({
      start: chunk.start,
      end: chunk.end,
      code: options.fundCode,
      kind: options.kinds[0],
      cookie,
    });
    upsertedCount += await upsertInBatches(
      filterToKnownFunds(buildHistoricalUpsertRows(options.fundCode, rows), knownCodes, droppedCodes),
      options.batchSize
    );
    requestCount += 1;
    console.log(`[history-backfill] ${options.fundCode} ${chunk.start}..${chunk.end}: ${rows.length} rows`);
    if (options.cooldownMs) await sleep(options.cooldownMs);
  }
  return { requestCount, upsertedCount };
}

async function backfillAllFunds(options, cookie, knownCodes) {
  const dates = buildBusinessDates(options.startDate, options.endDate);
  const droppedCodes = new Set();
  let requestCount = 0;
  let upsertedCount = 0;

  for (const [dateIndex, date] of dates.entries()) {
    for (const kind of options.kinds) {
      const rows = await fetchWithRateLimitRetry({ start: date, end: date, code: '', kind, cookie });
      upsertedCount += await upsertInBatches(
        filterToKnownFunds(buildHistoricalUpsertRows('', rows), knownCodes, droppedCodes),
        options.batchSize
      );
      requestCount += 1;
      if (options.cooldownMs) await sleep(options.cooldownMs);
    }

    if ((dateIndex + 1) % 10 === 0 || dateIndex === dates.length - 1) {
      console.log(
        `[history-backfill] ${dateIndex + 1}/${dates.length} business dates; `
        + `${requestCount} TEFAS requests; ${upsertedCount} rows upserted; `
        + `${droppedCodes.size} delisted codes skipped`
      );
    }
  }

  return { requestCount, upsertedCount, droppedCodeCount: droppedCodes.size };
}

async function fetchStoredHistory(code, startDate, endDate) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('historical_data')
      .select('date, price')
      .eq('fund_code', code)
      .gte('date', startDate)
      .lte('date', endDate)
      .gt('price', 0)
      .order('date', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to verify ${code}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }
  return rows;
}

function findLargestGapDays(rows) {
  let largestGapDays = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = Date.parse(`${rows[index - 1].date}T00:00:00Z`);
    const current = Date.parse(`${rows[index].date}T00:00:00Z`);
    largestGapDays = Math.max(largestGapDays, Math.round((current - previous) / 86_400_000));
  }
  return largestGapDays;
}

async function verifyCoverage(options) {
  const failures = [];
  for (const code of options.verifyCodes) {
    const rows = await fetchStoredHistory(code, options.startDate, options.endDate);
    const largestGapDays = findLargestGapDays(rows);
    const summary = {
      code,
      count: rows.length,
      first: rows[0]?.date || null,
      last: rows.at(-1)?.date || null,
      largestGapDays,
    };
    console.log(`[history-backfill] verification ${JSON.stringify(summary)}`);
    if (rows.length === 0 || largestGapDays > options.maxGapDays) failures.push(summary);
  }

  if (failures.length > 0) {
    throw new Error(`Historical coverage verification failed: ${JSON.stringify(failures)}`);
  }
}

async function main() {
  if (!supabase) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const options = parseArgs(process.argv.slice(2));
  console.log(`[history-backfill] starting ${JSON.stringify({ ...options, verifyCodes: options.verifyCodes })}`);
  const cookie = await bootstrapSession();
  const knownCodes = await loadKnownFundCodes();
  console.log(`[history-backfill] loaded ${knownCodes.size} known fund codes for FK filtering`);
  const result = options.fundCode
    ? await backfillFocusedFund(options, cookie, knownCodes)
    : await backfillAllFunds(options, cookie, knownCodes);
  await verifyCoverage(options);
  console.log(`[history-backfill] complete ${JSON.stringify(result)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[history-backfill] failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildBusinessDates,
  defaultStartDate,
  filterToKnownFunds,
  findLargestGapDays,
  parseArgs,
};
