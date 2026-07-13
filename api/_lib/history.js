const supabase = require('./supabase');

const normalizeCode = (code) => (code || '').toString().trim().toUpperCase();
const HISTORY_PAGE_SIZE = 1000;

const toPricePoint = (row) => {
  const value = Number(row?.price);
  if (!row?.date || !Number.isFinite(value) || value <= 0) return null;
  return { date: row.date, value };
};

async function fetchPagedRows(buildQuery, options = {}) {
  const pageSize = options.pageSize || HISTORY_PAGE_SIZE;
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) {
      throw new Error(error.message);
    }

    const page = data || [];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

const fetchFundHistory = async (code, startDate, endDate) => {
  if (!supabase) return [];
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return [];
  const data = await fetchPagedRows(() => (
    supabase
      .from('historical_data')
      .select('date, price')
      .eq('fund_code', normalizedCode)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
  ));

  return (data || []).map(toPricePoint).filter(Boolean);
};

const fetchFundHistoryBatch = async (codes, startDate, endDate) => {
  if (!supabase || !Array.isArray(codes) || codes.length === 0) return {};
  const normalizedCodes = [...new Set(codes.map(normalizeCode))].filter(Boolean);
  if (normalizedCodes.length === 0) return {};

  const data = await fetchPagedRows(() => (
    supabase
      .from('historical_data')
      .select('fund_code, date, price')
      .in('fund_code', normalizedCodes)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('fund_code', { ascending: true })
      .order('date', { ascending: true })
  ));

  const grouped = {};
  for (const row of data || []) {
    const point = toPricePoint(row);
    if (!point) continue;
    const code = row.fund_code;
    if (!grouped[code]) grouped[code] = [];
    grouped[code].push(point);
  }

  return grouped;
};

const fetchLatestPrice = async (code) => {
  if (!supabase) return null;
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return null;
  const { data, error } = await supabase
    .from('historical_data')
    .select('date, price')
    .eq('fund_code', normalizedCode)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(error.message);
  }

  if (!data) return null;
  return toPricePoint(data);
};

const fetchLatestPriceBatch = async (codes) => {
  if (!supabase || !Array.isArray(codes) || codes.length === 0) return {};
  const normalizedCodes = [...new Set(codes.map(normalizeCode))].filter(Boolean);

  if (normalizedCodes.length === 0) return {};

  // Fetch data for the last 30 days to ensure we get the latest price even if some days are missing
  const oneMonthAgo = new Date();
  oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
  const startDate = oneMonthAgo.toISOString().split('T')[0];

  const data = await fetchPagedRows(() => (
    supabase
      .from('historical_data')
      .select('fund_code, date, price')
      .in('fund_code', normalizedCodes)
      .gte('date', startDate)
      .order('date', { ascending: false })
  ));

  const latestPrices = {};
  for (const row of data || []) {
    const point = toPricePoint(row);
    if (!point) continue;
    // Since rows are ordered by date DESC, the first occurrence of a fund_code is the latest
    if (!latestPrices[row.fund_code]) {
      latestPrices[row.fund_code] = point;
    }
  }

  return latestPrices;
};

module.exports = {
  fetchFundHistory,
  fetchFundHistoryBatch,
  fetchPagedRows,
  fetchLatestPrice,
  fetchLatestPriceBatch,
  normalizeCode,
};
