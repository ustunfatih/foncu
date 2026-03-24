const supabase = require('../supabase');
const {
  buildCoverageStats,
  buildMetricSnapshot,
  rsiToSignal,
  upsertRows,
} = require('../sync-helpers');

async function loadProfilesForMetricRefresh(profiles) {
  if (Array.isArray(profiles) && profiles.length > 0) {
    return profiles;
  }

  const { data, error } = await supabase
    .from('fund_profiles')
    .select('fon_kodu')
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

async function syncFundMetrics(profiles, log, options = {}) {
  const asOf = options.asOf || new Date();
  const profilesToRefresh = await loadProfilesForMetricRefresh(profiles);
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - 420);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  log.push('Reading NAV history from historical_data for screener metrics...');

  const { data: navRows, error } = await supabase
    .from('historical_data')
    .select('fund_code, date, price')
    .gte('date', cutoffStr)
    .order('fund_code', { ascending: true })
    .order('date', { ascending: true });

  if (error) throw new Error(`Failed to read historical_data: ${error.message}`);

  const historyByFund = groupHistoryByFund(navRows);
  const metricRows = profilesToRefresh.map((profile) => {
    const snapshot = buildMetricSnapshot(historyByFund[profile.fon_kodu] || [], asOf);
    return {
      fon_kodu: profile.fon_kodu,
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
  syncFundMetrics,
};
