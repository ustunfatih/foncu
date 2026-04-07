const supabase = require('./_lib/supabase');
const { TTL, createCacheKey, getOrSetCache } = require('./_lib/cache');
const { hydrateFundMetricRows } = require('./_lib/providers/fund-metrics-provider');
const { ensureSupabase } = require('./_lib/supabase-guard');

function applyMinReturnFilter(rows, key, threshold) {
  if (threshold === undefined) return rows;
  const minValue = Number(threshold);
  return rows.filter((row) => row[key] != null && row[key] >= minValue);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  if (!ensureSupabase(res)) return;

  try {
    const {
      fonTipi,
      fonKategorisi,
      minRisk,
      maxRisk,
      minGetiri1g,
      minGetiri1a,
      minGetiri3a,
      minGetiri6a,
      minGetiriYtd,
      minGetiri1y,
      stopaj,
      rsiSinyal,
      limit = 1000,
    } = req.query;

    const cacheKey = createCacheKey('fund-screen', {
      fonTipi,
      fonKategorisi,
      minRisk,
      maxRisk,
      minGetiri1g,
      minGetiri1a,
      minGetiri3a,
      minGetiri6a,
      minGetiriYtd,
      minGetiri1y,
      stopaj,
      rsiSinyal,
      limit: Number(limit),
    });

    const { value, cached } = await getOrSetCache(cacheKey, TTL.FUND_SCREEN, async () => {
      const requestedLimit = Number(limit) || 1000;
      const sourceLimit = Math.max(requestedLimit, 1000);
      let query = supabase
        .from('fund_profiles')
        .select([
          'fon_kodu', 'unvan', 'portfoy_yonetim_sirketi', 'fon_tipi', 'fon_kategorisi',
          'risk_seviyesi', 'getiri_1g', 'getiri_1h', 'getiri_1a', 'getiri_3a',
          'getiri_6a', 'getiri_ytd', 'getiri_1y', 'yonetim_ucreti', 'stopaj',
          'rsi_14', 'rsi_sinyal', 'sma_50', 'sma_200', 'sma_kesisim_20_50', 'ma200_ustu',
          'guncelleme_zamani',
        ].join(', '))
        .order('getiri_1y', { ascending: false })
        .limit(sourceLimit);

      if (fonTipi) {
        query = query.eq('fon_tipi', fonTipi);
      }

      if (fonKategorisi) {
        query = query.ilike('fon_kategorisi', `%${fonKategorisi}%`);
      }

      if (minRisk !== undefined) {
        query = query.gte('risk_seviyesi', Number(minRisk));
      }

      if (maxRisk !== undefined) {
        query = query.lte('risk_seviyesi', Number(maxRisk));
      }

      if (stopaj !== undefined) {
        query = query.eq('stopaj', Number(stopaj));
      }

      if (rsiSinyal) {
        query = query.eq('rsi_sinyal', rsiSinyal);
      }

      const { data, error } = await query;
      if (error) throw error;

      let results = await hydrateFundMetricRows(data || []);
      results = applyMinReturnFilter(results, 'getiri_1g', minGetiri1g);
      results = applyMinReturnFilter(results, 'getiri_1a', minGetiri1a);
      results = applyMinReturnFilter(results, 'getiri_3a', minGetiri3a);
      results = applyMinReturnFilter(results, 'getiri_6a', minGetiri6a);
      results = applyMinReturnFilter(results, 'getiri_ytd', minGetiriYtd);
      results = applyMinReturnFilter(results, 'getiri_1y', minGetiri1y);
      results = results
        .slice()
        .sort((a, b) => (b.getiri_1y ?? Number.NEGATIVE_INFINITY) - (a.getiri_1y ?? Number.NEGATIVE_INFINITY))
        .slice(0, requestedLimit);

      const refreshedAt = results
        .map((row) => row.guncelleme_zamani)
        .filter(Boolean)
        .sort()
        .at(-1) || null;

      return { results, refreshedAt };
    });

    return res.status(200).json({
      results: value.results,
      total: value.results.length,
      meta: {
        cached,
        source: 'fund_profiles',
        refreshedAt: value.refreshedAt,
        warnings: [
          'Missing return fields are backfilled from historical NAV data when available.',
        ],
      },
    });
  } catch (err) {
    console.error('[fund-screen] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
