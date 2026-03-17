const supabase = require('./supabase');

/**
 * Upsert rows into a Supabase table.
 * @param {string} table
 * @param {Array<Object>} rows
 * @param {string} conflictColumn - column(s) for ON CONFLICT, e.g. 'fon_kodu' or 'fon_kodu,hisse_kodu,rapor_yil,rapor_ay'
 */
async function upsertRows(table, rows, conflictColumn) {
  if (!rows.length) return { count: 0 };
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

/**
 * Map RSI value to signal string.
 */
function rsiToSignal(rsi) {
  if (rsi === null) return 'normal';
  if (rsi < 25) return 'guclu_al';
  if (rsi < 35) return 'al';
  if (rsi < 45) return 'dikkat';
  return 'normal';
}

module.exports = { upsertRows, computeRsi14, computeSma, rsiToSignal };
