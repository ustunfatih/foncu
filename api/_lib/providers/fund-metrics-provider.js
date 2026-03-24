const supabase = require('../supabase');
const { fetchFundHistoryBatch } = require('../history');
const {
  buildCoverageStats,
  buildMetricSnapshot,
  rsiToSignal,
  upsertRows,
} = require('../sync-helpers');

const RETURN_FIELDS = [
  'getiri_1g',
  'getiri_1h',
  'getiri_1a',
  'getiri_3a',
  'getiri_6a',
  'getiri_ytd',
  'getiri_1y',
];

async function loadProfilesForMetricRefresh(profiles) {
  if (Array.isArray(profiles) && profiles.length > 0) {
    return profiles;
  }

  const { data, error } = await supabase
    .from('fund_profiles')
    .select('*')
    .order('fon_kodu', { ascending: true });

  if (error) throw new Error(`Failed to read fund_profiles for metric refresh: ${error.message}`);

  return data || [];
}

function groupHistoryByFund(navRows) {
  const grouped = {};
  for (const row of navRows || []) {
    if (!grouped[row.fund_code]) grouped[row.fund_code] = [];
    if (row.price == null) continue;
    grouped[row.fund_code].push({
      date: row.date,
      price: Number(row.price),
    });
  }
  return grouped;
}

function hasMissingReturnMetrics(row) {
  return RETURN_FIELDS.some((field) => row?.[field] == null);
}

function fillReturnMetrics(row, snapshot) {
  return {
    ...row,
    getiri_1g: row.getiri_1g ?? snapshot.getiri_1g,
    getiri_1h: row.getiri_1h ?? snapshot.getiri_1h,
    getiri_1a: row.getiri_1a ?? snapshot.getiri_1a,
    getiri_3a: row.getiri_3a ?? snapshot.getiri_3a,
    getiri_6a: row.getiri_6a ?? snapshot.getiri_6a,
    getiri_ytd: row.getiri_ytd ?? snapshot.getiri_ytd,
    getiri_1y: row.getiri_1y ?? snapshot.getiri_1y,
  };
}

async function hydrateFundMetricRows(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const asOf = options.asOf || new Date();
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - 420);
  const startDate = cutoff.toISOString().split('T')[0];
  const endDate = asOf.toISOString().split('T')[0];

  const rowsNeedingHistory = rows.filter((row) => row?.fon_kodu && hasMissingReturnMetrics(row));
  if (rowsNeedingHistory.length === 0) {
    return rows;
  }

  const historyByFund = await fetchFundHistoryBatch(
    rowsNeedingHistory.map((row) => row.fon_kodu),
    startDate,
    endDate
  );

  return rows.map((row) => {
    if (!row?.fon_kodu || !hasMissingReturnMetrics(row)) {
      return row;
    }

    const history = (historyByFund[row.fon_kodu] || []).map((point) => ({
      date: point.date,
      price: point.value,
    }));

    if (history.length === 0) {
      return row;
    }

    return fillReturnMetrics(row, buildMetricSnapshot(history, asOf));
  });
}

async function syncFundMetrics(profiles, log, options = {}) {
  const asOf = options.asOf || new Date();
  const profilesToRefresh = await loadProfilesForMetricRefresh(profiles);
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - 420);
  const startDate = cutoff.toISOString().split('T')[0];
  const endDate = asOf.toISOString().split('T')[0];
  const historyBatchSize = options.historyBatchSize || 200;

  log.push('Reading NAV history from historical_data for screener metrics...');

  const historyByFund = {};
  for (let index = 0; index < profilesToRefresh.length; index += historyBatchSize) {
    const batchCodes = profilesToRefresh
      .slice(index, index + historyBatchSize)
      .map((profile) => profile.fon_kodu)
      .filter(Boolean);
    const batchHistory = await fetchFundHistoryBatch(batchCodes, startDate, endDate);
    Object.assign(historyByFund, batchHistory);
  }

  const metricRows = profilesToRefresh.map((profile) => {
    const snapshot = buildMetricSnapshot(historyByFund[profile.fon_kodu] || [], asOf);
    return {
      ...profile,
      son_fiyat: snapshot.son_fiyat,
      getiri_1g: snapshot.getiri_1g,
      getiri_1h: snapshot.getiri_1h,
      getiri_1a: snapshot.getiri_1a,
      getiri_3a: snapshot.getiri_3a,
      getiri_6a: snapshot.getiri_6a,
      getiri_ytd: snapshot.getiri_ytd,
      getiri_1y: snapshot.getiri_1y,
      rsi_14: snapshot.rsi_14,
      sma_20: snapshot.sma_20,
      sma_50: snapshot.sma_50,
      sma_200: snapshot.sma_200,
      ma200_ustu: snapshot.sma_200 !== null && snapshot.son_fiyat !== null
        ? snapshot.son_fiyat > snapshot.sma_200
        : null,
      sma_kesisim_20_50: snapshot.sma_kesisim_20_50,
      rsi_sinyal: rsiToSignal(snapshot.rsi_14),
      guncelleme_zamani: asOf.toISOString(),
    };
  });

  const { count } = await upsertRows('fund_profiles', metricRows, 'fon_kodu');
  const coverage = buildCoverageStats(metricRows);

  log.push(
    `Updated screener metrics for ${count} funds ` +
    `(YTD: ${coverage.fundsWithYtd}, 1Y: ${coverage.fundsWith1Y}, SMA200: ${coverage.fundsWithSma200})`
  );

  return {
    metricCount: count,
    coverage,
  };
}

module.exports = {
  groupHistoryByFund,
  hydrateFundMetricRows,
  syncFundMetrics,
};
