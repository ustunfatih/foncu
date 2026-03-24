const supabase = require('./_lib/supabase');
const { TTL, createCacheKey, getOrSetCache } = require('./_lib/cache');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  try {
    const { ticker, minWeight = 0, fundType = 'mutual', limit = 50 } = req.query;
    if (!ticker) return res.status(400).json({ error: 'ticker param required' });

    const kindMap = {
      YAT: 'mutual', EMK: 'pension', BYF: 'exchange',
      mutual: 'mutual', pension: 'pension', exchange: 'exchange'
    };
    const fon_tipi = kindMap[fundType] ?? 'mutual';

    const { value, cached } = await getOrSetCache(
      createCacheKey('holdings-screener', {
        ticker: ticker.toUpperCase(),
        minWeight: Number(minWeight),
        fundType: fon_tipi,
        limit: Number(limit),
      }),
      TTL.HOLDINGS_SCREEN,
      async () => {
        const { data: holdingRows, error } = await supabase
          .from('fund_holdings')
          .select('fon_kodu, yuzdesel_agirlik, rapor_yil, rapor_ay')
          .eq('hisse_kodu', ticker.toUpperCase())
          .gte('yuzdesel_agirlik', Number(minWeight))
          .order('rapor_yil', { ascending: false })
          .order('rapor_ay', { ascending: false });

        if (error) throw error;

        const latestPerFund = {};
        for (const row of holdingRows || []) {
          if (!latestPerFund[row.fon_kodu]) latestPerFund[row.fon_kodu] = row;
        }

        const fundCodes = Object.keys(latestPerFund);
        if (!fundCodes.length) {
          return { rapor: null, fonlar: [], refreshedAt: null };
        }

        const { data: profiles } = await supabase
          .from('fund_profiles')
          .select('fon_kodu, unvan, portfoy_yonetim_sirketi, getiri_1y, risk_seviyesi, fon_tipi, guncelleme_zamani')
          .in('fon_kodu', fundCodes)
          .eq('fon_tipi', fon_tipi);

        const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.fon_kodu, p]));
        const fonlar = fundCodes
          .map((code) => {
            const holding = latestPerFund[code];
            const profile = profileMap[code];
            if (!profile) return null;
            return {
              fon_kodu: code,
              unvan: profile.unvan,
              portfoy_yonetim_sirketi: profile.portfoy_yonetim_sirketi,
              agirlik: holding.yuzdesel_agirlik,
              getiri_1y: profile.getiri_1y,
              risk_seviyesi: profile.risk_seviyesi,
            };
          })
          .filter(Boolean)
          .sort((a, b) => b.agirlik - a.agirlik)
          .slice(0, Number(limit));

        const sample = Object.values(latestPerFund)[0];
        const refreshedAt = (profiles || [])
          .map((row) => row.guncelleme_zamani)
          .filter(Boolean)
          .sort()
          .at(-1) || null;

        return {
          rapor: sample ? { yil: sample.rapor_yil, ay: sample.rapor_ay } : null,
          fonlar,
          refreshedAt,
        };
      }
    );

    return res.status(200).json({
      ticker: ticker.toUpperCase(),
      rapor: value.rapor,
      fonlar: value.fonlar,
      meta: {
        cached,
        source: 'fund_holdings+fund_profiles',
        refreshedAt: value.refreshedAt,
      },
    });
  } catch (err) {
    console.error('[holdings-screener] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
