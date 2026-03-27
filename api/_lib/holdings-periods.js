const supabase = require('./supabase');

function ensureSupabase() {
  if (!supabase) {
    const error = new Error('Supabase is not configured');
    error.statusCode = 503;
    throw error;
  }
}

function buildPeriodKey(yil, ay) {
  return `${yil}-${String(ay).padStart(2, '0')}`;
}

function comparePeriodsDesc(a, b) {
  if (a.yil !== b.yil) return b.yil - a.yil;
  return b.ay - a.ay;
}

function dedupePeriods(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!row?.rapor_yil || !row?.rapor_ay) continue;
    const key = buildPeriodKey(row.rapor_yil, row.rapor_ay);
    if (!map.has(key)) {
      map.set(key, { yil: row.rapor_yil, ay: row.rapor_ay });
    }
  }
  return Array.from(map.values()).sort(comparePeriodsDesc);
}

async function resolveLatestCommonHoldingsPeriod(fundCodes) {
  ensureSupabase();

  const normalizedCodes = [...new Set((fundCodes || []).map((code) => code?.trim()?.toUpperCase()).filter(Boolean))];
  if (!normalizedCodes.length) return null;

  const { data, error } = await supabase
    .from('fund_holdings')
    .select('fon_kodu, rapor_yil, rapor_ay')
    .in('fon_kodu', normalizedCodes);

  if (error) throw error;
  if (!data?.length) return null;

  const periodSetsByFund = new Map();
  for (const code of normalizedCodes) {
    periodSetsByFund.set(code, new Set());
  }

  for (const row of data) {
    const periodKey = buildPeriodKey(row.rapor_yil, row.rapor_ay);
    periodSetsByFund.get(row.fon_kodu)?.add(periodKey);
  }

  const candidatePeriods = dedupePeriods(data);
  for (const period of candidatePeriods) {
    const key = buildPeriodKey(period.yil, period.ay);
    const isCommon = normalizedCodes.every((code) => periodSetsByFund.get(code)?.has(key));
    if (isCommon) return period;
  }

  return null;
}

async function resolveLatestPublishedHoldingsPeriod() {
  ensureSupabase();

  try {
    const { data, error } = await supabase
      .from('fund_holdings_snapshots')
      .select('rapor_yil, rapor_ay, acquired_at')
      .eq('status', 'ready')
      .order('rapor_yil', { ascending: false })
      .order('rapor_ay', { ascending: false })
      .limit(1);

    if (!error && data?.length) {
      return {
        yil: data[0].rapor_yil,
        ay: data[0].rapor_ay,
        acquiredAt: data[0].acquired_at ?? null,
      };
    }
  } catch {
    // Fallback below keeps reads working before the migration is applied.
  }

  const { data, error } = await supabase
    .from('fund_holdings')
    .select('rapor_yil, rapor_ay')
    .order('rapor_yil', { ascending: false })
    .order('rapor_ay', { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!data?.length) return null;

  return {
    yil: data[0].rapor_yil,
    ay: data[0].rapor_ay,
    acquiredAt: null,
  };
}

module.exports = {
  buildPeriodKey,
  comparePeriodsDesc,
  dedupePeriods,
  ensureSupabase,
  resolveLatestCommonHoldingsPeriod,
  resolveLatestPublishedHoldingsPeriod,
};
