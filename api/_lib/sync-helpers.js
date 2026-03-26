const supabase = require('./supabase');

/**
 * Upsert rows into a Supabase table.
 * @param {string} table
 * @param {Array<Object>} rows
 * @param {string} conflictColumn - column(s) for ON CONFLICT, e.g. 'fon_kodu' or 'fon_kodu,hisse_kodu,rapor_yil,rapor_ay'
 */
async function upsertRows(table, rows, conflictColumn) {
  if (!rows.length) return { count: 0 };
  if (!supabase) throw new Error('Supabase client is not initialized (missing env vars)');
  const { error, count } = await supabase
    .from(table)
    .upsert(rows, { onConflict: conflictColumn, count: 'exact' });
  if (error) throw new Error(`Supabase upsert to ${table} failed: ${error.message}`);
  return { count };
}

/**
 * Compute RSI(14) from an array of closing prices (oldest first).
 * Returns null if fewer than 15 prices provided.
 */
function computeRsi14(prices) {
  if (prices.length < 15) return null;
  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  // Initial average gain/loss over first 14 periods
  let avgGain = changes.slice(0, 14).filter(c => c > 0).reduce((a, b) => a + b, 0) / 14;
  let avgLoss = changes.slice(0, 14).filter(c => c < 0).map(Math.abs).reduce((a, b) => a + b, 0) / 14;
  for (const change of changes.slice(14)) {
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = (avgGain * 13 + gain) / 14;
    avgLoss = (avgLoss * 13 + loss) / 14;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

/**
 * Compute SMA(period) from prices array (oldest first).
 * Returns null if insufficient data.
 */
function computeSma(prices, period) {
  if (prices.length < period) return null;
  const tail = prices.slice(-period);
  return tail.reduce((a, b) => a + b, 0) / period;
}

function roundMetric(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function toDateOnly(value) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00Z`);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function normalizeHistoryRows(rows) {
  const deduped = new Map();
  for (const row of rows || []) {
    const date = row.date || row.tarih;
    const price = row.price ?? row.value ?? row.fiyat;
    if (!date || price == null) continue;
    deduped.set(date, {
      date,
      price: Number(price),
    });
  }

  return Array.from(deduped.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function findRowOnOrBefore(rows, targetDate) {
  const target = toDateOnly(targetDate);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const rowDate = toDateOnly(rows[i].date);
    if (rowDate.getTime() <= target.getTime()) {
      return rows[i];
    }
  }
  return null;
}

function findRowBefore(rows, targetDate) {
  const target = toDateOnly(targetDate);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const rowDate = toDateOnly(rows[i].date);
    if (rowDate.getTime() < target.getTime()) {
      return rows[i];
    }
  }
  return null;
}

function computeReturnSinceDate(rows, targetDate) {
  if (!rows || rows.length < 2) return null;
  const latest = rows[rows.length - 1];
  const base = findRowOnOrBefore(rows, targetDate);
  if (!base || !base.price) return null;
  return roundMetric(((latest.price / base.price) - 1) * 100);
}

function computeYtdReturn(rows, now = new Date()) {
  if (!rows || rows.length < 2) return null;
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const latest = rows[rows.length - 1];
  const base = findRowBefore(rows, startOfYear);
  if (!base || !base.price) return null;
  return roundMetric(((latest.price / base.price) - 1) * 100);
}

function computeSmaCrossover(prices, shortPeriod = 20, longPeriod = 50, lookbackPeriods = 5) {
  if (prices.length < longPeriod + lookbackPeriods) return false;
  const currentShort = computeSma(prices, shortPeriod);
  const currentLong = computeSma(prices, longPeriod);
  const previousShort = computeSma(prices.slice(0, -lookbackPeriods), shortPeriod);
  const previousLong = computeSma(prices.slice(0, -lookbackPeriods), longPeriod);

  if (
    currentShort === null ||
    currentLong === null ||
    previousShort === null ||
    previousLong === null
  ) {
    return false;
  }

  return previousShort < previousLong && currentShort > currentLong;
}

function buildMetricSnapshot(rows, now = new Date()) {
  const normalizedRows = normalizeHistoryRows(rows);
  const prices = normalizedRows.map((row) => row.price);
  const latest = normalizedRows[normalizedRows.length - 1] || null;
  const latestDate = latest ? toDateOnly(latest.date) : null;
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  return {
    son_fiyat: latest ? latest.price : null,
    getiri_1g: latestDate ? computeReturnSinceDate(normalizedRows, new Date(latestDate.getTime() - 1 * 24 * 60 * 60 * 1000)) : null,
    getiri_1h: latestDate ? computeReturnSinceDate(normalizedRows, new Date(latestDate.getTime() - 7 * 24 * 60 * 60 * 1000)) : null,
    getiri_1a: latestDate ? computeReturnSinceDate(normalizedRows, new Date(latestDate.getTime() - 30 * 24 * 60 * 60 * 1000)) : null,
    getiri_3a: latestDate ? computeReturnSinceDate(normalizedRows, new Date(latestDate.getTime() - 90 * 24 * 60 * 60 * 1000)) : null,
    getiri_6a: latestDate ? computeReturnSinceDate(normalizedRows, new Date(latestDate.getTime() - 180 * 24 * 60 * 60 * 1000)) : null,
    getiri_ytd: latestDate && latestDate >= startOfYear ? computeYtdReturn(normalizedRows, latestDate) : null,
    getiri_1y: latestDate ? computeReturnSinceDate(normalizedRows, new Date(latestDate.getTime() - 365 * 24 * 60 * 60 * 1000)) : null,
    rsi_14: computeRsi14(prices),
    sma_20: computeSma(prices, 20),
    sma_50: computeSma(prices, 50),
    sma_200: computeSma(prices, 200),
    sma_kesisim_20_50: computeSmaCrossover(prices),
  };
}

function buildCoverageStats(metricRows) {
  const stats = {
    totalFundsRefreshed: metricRows.length,
    fundsWithYtd: 0,
    fundsWith1Y: 0,
    fundsWithSma200: 0,
    fundsWith1H: 0,
    fundsMissingHistory: 0,
  };

  for (const row of metricRows) {
    if (row.getiri_ytd != null) stats.fundsWithYtd += 1;
    if (row.getiri_1y != null) stats.fundsWith1Y += 1;
    if (row.sma_200 != null) stats.fundsWithSma200 += 1;
    if (row.getiri_1h != null) stats.fundsWith1H += 1;
    if (row.son_fiyat == null) stats.fundsMissingHistory += 1;
  }

  return stats;
}

/**
 * Map RSI value to signal string.
 */
function rsiToSignal(rsi) {
  if (rsi === null || rsi === undefined) return null;
  if (rsi < 25) return 'guclu_al';
  if (rsi < 35) return 'al';
  if (rsi < 45) return 'dikkat';
  return 'normal';
}

module.exports = {
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
  roundMetric,
  rsiToSignal,
  toDateOnly,
  upsertRows,
};
