const supabase = require('./_lib/supabase');
const { ensureSupabase } = require('./_lib/supabase-guard');
const { ValidationError, parsePositiveInt } = require('./_lib/validation');
const { enforceRateLimit } = require('./_lib/rate-limit');

const FIVE_YEARS_IN_DAYS = 365 * 5;
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

function toSeries(rows, field) {
  return rows
    .filter((row) => row[field] !== null && row[field] !== undefined)
    .map((row) => ({ date: row.date, value: Number(row[field]) || 0 }));
}

function toAllocation(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      label: item.ad || item.label || item.kod || 'Diğer',
      value: Number(item.agirlik ?? item.value) || 0,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

module.exports = async function handler(req, res) {
  if (!enforceRateLimit(req, res, { name: 'fund-history', limit: 45 })) return;
  if (!ensureSupabase(res)) return;

  try {
    const code = String(req.query.code || '').trim().toUpperCase();
    const kind = String(req.query.kind || 'YAT').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(code)) {
      return res.status(400).json({ error: 'Geçerli bir fon kodu girin' });
    }

    const days = parsePositiveInt(req.query.days, {
      paramName: 'days',
      min: 1,
      max: FIVE_YEARS_IN_DAYS,
      defaultValue: FIVE_YEARS_IN_DAYS,
    });
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const [historyResult, profileResult, legacyFundResult] = await Promise.all([
      supabase
        .from('historical_data')
        .select('date, price, market_cap, investor_count')
        .eq('fund_code', code)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }),
      supabase
        .from('fund_profiles')
        .select('unvan, varlik_dagilimi, guncelleme_zamani')
        .eq('fon_kodu', code)
        .maybeSingle(),
      supabase.from('funds').select('title, updated_at').eq('code', code).maybeSingle(),
    ]);

    if (historyResult.error) throw historyResult.error;
    const rows = historyResult.data || [];
    if (!rows.length) {
      return res.status(404).json({
        error: 'Bu fon için henüz tarihsel veri bulunmuyor',
        code: 'HISTORY_NOT_INGESTED',
        retryable: true,
      });
    }

    const profile = profileResult.data || null;
    const legacyFund = legacyFundResult.data || null;
    const latest = rows.at(-1);
    const refreshedAt = profile?.guncelleme_zamani || legacyFund?.updated_at || `${latest.date}T00:00:00.000Z`;
    const refreshedMs = new Date(refreshedAt).getTime();
    const stale = !Number.isFinite(refreshedMs) || Date.now() - refreshedMs > STALE_AFTER_MS;

    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400');
    return res.status(200).json({
      fund: {
        code,
        title: profile?.unvan || legacyFund?.title || code,
        kind,
        priceHistory: toSeries(rows, 'price'),
        marketCapHistory: toSeries(rows, 'market_cap'),
        investorHistory: toSeries(rows, 'investor_count'),
        allocation: toAllocation(profile?.varlik_dagilimi),
        latestPrice: Number(latest.price) || 0,
        latestDate: latest.date,
      },
      meta: {
        source: 'supabase',
        upstream: 'TEFAS',
        refreshedAt,
        stale,
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message, code: 'INVALID_ARGUMENT', retryable: false });
    }
    console.error('[fund-history] failed', error.message);
    return res.status(503).json({
      error: 'Fon verileri şu anda kullanılamıyor',
      code: 'DATA_SOURCE_UNAVAILABLE',
      retryable: true,
    });
  }
};
