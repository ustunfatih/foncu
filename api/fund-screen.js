const supabase = require('./_lib/supabase');
const { TTL, createCacheKey, getOrSetCache } = require('./_lib/cache');

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
      minGetiriYtd,
      minGetiri1y,
      stopaj,
      rsiSinyal,
      limit: Number(limit),
    });

    const { value, cached } = await getOrSetCache(cacheKey, TTL.FUND_SCREEN, async () => {
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
        .limit(Number(limit));

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

      if (minGetiri1g !== undefined) {
        query = query.not('getiri_1g', 'is', null).gte('getiri_1g', Number(minGetiri1g));
      }

      if (minGetiri1a !== undefined) {
        query = query.not('getiri_1a', 'is', null).gte('getiri_1a', Number(minGetiri1a));
      }

      if (minGetiriYtd !== undefined) {
        query = query.not('getiri_ytd', 'is', null).gte('getiri_ytd', Number(minGetiriYtd));
      }

      if (minGetiri1y !== undefined) {
        query = query.not('getiri_1y', 'is', null).gte('getiri_1y', Number(minGetiri1y));
      }

      if (stopaj !== undefined) {
        query = query.eq('stopaj', Number(stopaj));
      }

      if (rsiSinyal) {
        query = query.eq('rsi_sinyal', rsiSinyal);
      }

      const { data, error } = await query;
      if (error) throw error;

      const results = data || [];
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
          'Filtered queries exclude funds whose requested metric is unavailable.',
        ],
      },
    });
  } catch (err) {
    console.error('[fund-screen] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
