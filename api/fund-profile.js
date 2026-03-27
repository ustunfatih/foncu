const supabase = require('./_lib/supabase');
const { TTL, createCacheKey, getOrSetCache } = require('./_lib/cache');
const { fetchFundHistory } = require('./_lib/history');
const { calculateSharpeRatio, calculateVolatility, calculateMaxDrawdown } = require('./_lib/analytics');
const { resolveLatestCommonHoldingsPeriod } = require('./_lib/holdings-periods');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  try {
    const code = req.query.code?.toUpperCase();
    if (!code) return res.status(400).json({ error: 'code param required' });

    const { value, cached } = await getOrSetCache(
      createCacheKey('fund-profile', { code }),
      TTL.FUND_PROFILE,
      async () => {
        const { data: profile, error: profileErr } = await supabase
          .from('fund_profiles')
          .select('*')
          .eq('fon_kodu', code)
          .single();

        if (profileErr || !profile) {
          const error = new Error(`Fund ${code} not found in fund_profiles`);
          error.statusCode = 404;
          throw error;
        }

        const latestRapor = await resolveLatestCommonHoldingsPeriod([code]);
        let topHoldings = [];

        if (latestRapor) {
          const { data: holdings, error: holdingsErr } = await supabase
            .from('fund_holdings')
            .select('hisse_kodu, yuzdesel_agirlik')
            .eq('fon_kodu', code)
            .eq('rapor_yil', latestRapor.yil)
            .eq('rapor_ay', latestRapor.ay)
            .order('yuzdesel_agirlik', { ascending: false })
            .limit(10);

          if (holdingsErr) throw holdingsErr;

          topHoldings = (holdings ?? [])
          .map((holding) => ({ ticker: holding.hisse_kodu, agirlik: holding.yuzdesel_agirlik }));
        }

        let sharpe = null;
        let maxDrawdown = null;
        let volatility = null;
        try {
          const oneYearAgo = new Date();
          oneYearAgo.setDate(oneYearAgo.getDate() - 365);
          const navHistory = await fetchFundHistory(code, oneYearAgo.toISOString().split('T')[0], new Date().toISOString().split('T')[0]);
          const points = (navHistory || []).filter((point) => point && typeof point.value === 'number');
          if (points.length >= 10) {
            sharpe = calculateSharpeRatio(points);
            maxDrawdown = calculateMaxDrawdown(points);
            volatility = calculateVolatility(points);
          }
        } catch {
          // History is optional here. The profile can still render without these metrics.
        }

        return {
          payload: {
            fon_kodu: profile.fon_kodu,
            unvan: profile.unvan,
            fon_tipi: profile.fon_tipi,
            portfoy_yonetim_sirketi: profile.portfoy_yonetim_sirketi,
            risk_seviyesi: profile.risk_seviyesi,
            stopaj: profile.stopaj,
            yonetim_ucreti: profile.yonetim_ucreti,
            alis_valoru: profile.alis_valoru,
            satis_valoru: profile.satis_valoru,
            fon_kategorisi: profile.fon_kategorisi,
            tefasa_acik: profile.tefasa_acik,
            metriks: {
              getiri_1y: profile.getiri_1y,
              getiri_1a: profile.getiri_1a,
              fon_buyuklugu: profile.fon_buyuklugu,
              yatirimci_sayisi: profile.yatirimci_sayisi,
              sharpe,
              max_drawdown: maxDrawdown,
              volatilite: volatility,
            },
            varlik_dagilimi: profile.varlik_dagilimi ?? [],
            topHoldings,
            rapor: latestRapor,
          },
          refreshedAt: profile.guncelleme_zamani || null,
        };
      }
    );

    return res.status(200).json({
      ...value.payload,
      meta: {
        cached,
        source: 'fund_profiles+fund_holdings+historical_data',
        refreshedAt: value.refreshedAt,
      },
    });
  } catch (err) {
    console.error('[fund-profile] Error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};
