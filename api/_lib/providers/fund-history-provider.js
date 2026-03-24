const supabase = require('../supabase');
const { bootstrapSession, fetchInfo, formatDate, toISO } = require('../tefas');
const { upsertRows } = require('../sync-helpers');

const LOOKBACK_DAYS = 420;
const TEFAS_KIND_BY_FUND_TYPE = {
  mutual: 'YAT',
  pension: 'EMK',
  exchange: 'BYF',
};
const LONG_HORIZON_RETURN_FIELDS = ['getiri_3a', 'getiri_6a', 'getiri_1y'];

function requiresLongHorizonBackfill(profile) {
  return LONG_HORIZON_RETURN_FIELDS.some((field) => profile?.[field] == null);
}

function hasMetricCoverageFields(profile) {
  return LONG_HORIZON_RETURN_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(profile || {}, field));
}

async function loadProfilesForHistoryBackfill(profiles) {
  if (Array.isArray(profiles) && profiles.length > 0 && hasMetricCoverageFields(profiles[0])) {
    return profiles;
  }

  const { data, error } = await supabase
    .from('fund_profiles')
    .select('fon_kodu, fon_tipi, getiri_3a, getiri_6a, getiri_1y')
    .order('fon_kodu', { ascending: true });

  if (error) {
    throw new Error(`Failed to read fund_profiles for history backfill: ${error.message}`);
  }

  return data || [];
}

function buildDateChunks(startDate, endDate, maxDays = 90) {
  const chunks = [];
  let currentEnd = new Date(endDate);
  currentEnd.setUTCHours(0, 0, 0, 0);
  const normalizedStart = new Date(startDate);
  normalizedStart.setUTCHours(0, 0, 0, 0);

  while (currentEnd >= normalizedStart) {
    const currentStart = new Date(currentEnd);
    currentStart.setUTCDate(currentStart.getUTCDate() - (maxDays - 1));
    if (currentStart < normalizedStart) {
      currentStart.setTime(normalizedStart.getTime());
    }

    chunks.push({
      start: formatDate(currentStart),
      end: formatDate(currentEnd),
    });

    currentEnd = new Date(currentStart);
    currentEnd.setUTCDate(currentEnd.getUTCDate() - 1);
  }

  return chunks.reverse();
}

function buildHistoricalUpsertRows(code, tefasRows) {
  const rowsByDate = new Map();

  for (const row of tefasRows || []) {
    if (!row?.TARIH || row.FIYAT == null) continue;

    const date = toISO(row.TARIH);
    rowsByDate.set(date, {
      fund_code: code,
      date,
      price: Number(row.FIYAT) || 0,
      market_cap: row.PORTFOYBUYUKLUK != null ? Number(row.PORTFOYBUYUKLUK) || 0 : 0,
      investor_count: row.KISISAYISI != null ? Number(row.KISISAYISI) || 0 : 0,
    });
  }

  return Array.from(rowsByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchLongRangeHistory(profile, cookie, startDate, endDate) {
  const tefasKind = TEFAS_KIND_BY_FUND_TYPE[profile.fon_tipi] || 'YAT';
  const chunks = buildDateChunks(startDate, endDate);
  const allRows = [];

  for (const chunk of chunks) {
    const rows = await fetchInfo({
      start: chunk.start,
      end: chunk.end,
      code: profile.fon_kodu,
      kind: tefasKind,
      cookie,
    });
    allRows.push(...rows);
  }

  return buildHistoricalUpsertRows(profile.fon_kodu, allRows);
}

async function backfillMissingMetricHistory(profiles, log, options = {}) {
  if (!supabase) {
    log.push('Skipping historical_data backfill because Supabase is not configured.');
    return {
      candidateCount: 0,
      backfilledFundCount: 0,
      insertedHistoryRowCount: 0,
      skippedFundCount: 0,
    };
  }

  const asOf = options.asOf || new Date();
  const lookbackDays = options.lookbackDays || LOOKBACK_DAYS;
  const concurrency = options.concurrency || 3;
  const allProfiles = await loadProfilesForHistoryBackfill(profiles);
  const targets = allProfiles.filter((profile) => profile?.fon_kodu && requiresLongHorizonBackfill(profile));

  if (targets.length === 0) {
    log.push('No funds require long-horizon historical backfill.');
    return {
      candidateCount: 0,
      backfilledFundCount: 0,
      insertedHistoryRowCount: 0,
      skippedFundCount: 0,
    };
  }

  const startDate = new Date(asOf);
  startDate.setUTCDate(startDate.getUTCDate() - lookbackDays);

  log.push(`Backfilling TEFAS history for ${targets.length} funds missing 3A/6A/1Y metrics...`);
  const cookie = await bootstrapSession();

  let backfilledFundCount = 0;
  let insertedHistoryRowCount = 0;
  let skippedFundCount = 0;

  for (let index = 0; index < targets.length; index += concurrency) {
    const batch = targets.slice(index, index + concurrency);
    const batchResults = await Promise.all(batch.map(async (profile) => {
      try {
        const historyRows = await fetchLongRangeHistory(profile, cookie, startDate, asOf);
        if (historyRows.length === 0) {
          return { code: profile.fon_kodu, insertedRows: 0, skipped: true };
        }

        const { count } = await upsertRows('historical_data', historyRows, 'fund_code,date');
        return {
          code: profile.fon_kodu,
          insertedRows: count ?? historyRows.length,
          skipped: false,
        };
      } catch (error) {
        log.push(`  Failed to backfill ${profile.fon_kodu}: ${error.message}`);
        return { code: profile.fon_kodu, insertedRows: 0, skipped: true };
      }
    }));

    for (const result of batchResults) {
      if (result.skipped) {
        skippedFundCount += 1;
      } else {
        backfilledFundCount += 1;
        insertedHistoryRowCount += result.insertedRows;
      }
    }
  }

  log.push(
    `Backfilled ${insertedHistoryRowCount} historical_data rows across ` +
    `${backfilledFundCount} funds (${skippedFundCount} skipped).`
  );

  return {
    candidateCount: targets.length,
    backfilledFundCount,
    insertedHistoryRowCount,
    skippedFundCount,
  };
}

module.exports = {
  LOOKBACK_DAYS,
  TEFAS_KIND_BY_FUND_TYPE,
  backfillMissingMetricHistory,
  buildDateChunks,
  buildHistoricalUpsertRows,
  requiresLongHorizonBackfill,
};
