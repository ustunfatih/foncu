const supabase = require('./_lib/supabase');
const { TTL, createCacheKey, getOrSetCache } = require('./_lib/cache');
const { hydrateFundMetricRows } = require('./_lib/providers/fund-metrics-provider');
const { ValidationError, parseNumber, parsePositiveInt } = require('./_lib/validation');

function applyMinReturnFilter(rows, key, threshold) {
  if (threshold === undefined) return rows;
  return rows.filter((row) => row[key] != null && row[key] >= threshold);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');

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
      limit,
    } = req.query;

    const requestedLimit = parsePositiveInt(limit, {
      paramName: 'limit',
      min: 1,
      max: 200,
      defaultValue: 100,
    });

    const numericFilters = {
      minRisk: parseNumber(minRisk, { paramName: 'minRisk', min: 0 }),
      maxRisk: parseNumber(maxRisk, { paramName: 'maxRisk', min: 0 }),
      minGetiri1g: parseNumber(minGetiri1g, { paramName: 'minGetiri1g', min: 0 }),
      minGetiri1a: parseNumber(minGetiri1a, { paramName: 'minGetiri1a', min: 0 }),
      minGetiri3a: parseNumber(minGetiri3a, { paramName: 'minGetiri3a', min: 0 }),
      minGetiri6a: parseNumber(minGetiri6a, { paramName: 'minGetiri6a', min: 0 }),
      minGetiriYtd: parseNumber(minGetiriYtd, { paramName: 'minGetiriYtd', min: 0 }),
      minGetiri1y: parseNumber(minGetiri1y, { paramName: 'minGetiri1y', min: 0 }),
    };

    if (
      numericFilters.minRisk !== undefined
      && numericFilters.maxRisk !== undefined
      && numericFilters.minRisk > numericFilters.maxRisk
    ) {
      return res.status(400).json({ error: 'Invalid value for "minRisk": must be less than or equal to "maxRisk"' });
    }

    const stopajValue = parseNumber(stopaj, { paramName: 'stopaj', min: 0 });

    const cacheKey = createCacheKey('fund-screen', {
      fonTipi,
      fonKategorisi,
      ...numericFilters,
      stopaj: stopajValue,
      rsiSinyal,
      limit: requestedLimit,
    });

    const { value, cached } = await getOrSetCache(cacheKey, TTL.FUND_SCREEN, async () => {
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

      if (numericFilters.minRisk !== undefined) {
        query = query.gte('risk_seviyesi', numericFilters.minRisk);
      }

      if (numericFilters.maxRisk !== undefined) {
        query = query.lte('risk_seviyesi', numericFilters.maxRisk);
      }

      if (stopajValue !== undefined) {
        query = query.eq('stopaj', stopajValue);
      }

      if (rsiSinyal) {
        query = query.eq('rsi_sinyal', rsiSinyal);
      }

      const { data, error } = await query;
      if (error) throw error;

      let results = await hydrateFundMetricRows(data || []);
      results = applyMinReturnFilter(results, 'getiri_1g', numericFilters.minGetiri1g);
      results = applyMinReturnFilter(results, 'getiri_1a', numericFilters.minGetiri1a);
      results = applyMinReturnFilter(results, 'getiri_3a', numericFilters.minGetiri3a);
      results = applyMinReturnFilter(results, 'getiri_6a', numericFilters.minGetiri6a);
      results = applyMinReturnFilter(results, 'getiri_ytd', numericFilters.minGetiriYtd);
      results = applyMinReturnFilter(results, 'getiri_1y', numericFilters.minGetiri1y);
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
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }

    console.error('[fund-screen] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
