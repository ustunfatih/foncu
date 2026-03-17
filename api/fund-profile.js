const supabase = require('./_lib/supabase');
const { fetchFundHistory } = require('./_lib/history');
const { calculateSharpeRatio, calculateVolatility, calculateMaxDrawdown } = require('./_lib/analytics');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  try {
    const code = req.query.code?.toUpperCase();
    if (!code) return res.status(400).json({ error: 'code param required' });

    // Fetch profile from fund_profiles
    const { data: profile, error: profileErr } = await supabase
      .from('fund_profiles')
      .select('*')
      .eq('fon_kodu', code)
      .single();

    if (profileErr || !profile) {
      return res.status(404).json({ error: `Fund ${code} not found in fund_profiles` });
    }

    // Fetch top holdings (latest report only)
    const { data: holdings } = await supabase
      .from('fund_holdings')
      .select('hisse_kodu, yuzdesel_agirlik, rapor_yil, rapor_ay')
      .eq('fon_kodu', code)
      .order('rapor_yil', { ascending: false })
      .order('rapor_ay', { ascending: false })
      .order('yuzdesel_agirlik', { ascending: false })
      .limit(50);

    const latestRapor = holdings?.[0]
      ? { yil: holdings[0].rapor_yil, ay: holdings[0].rapor_ay }
      : null;

    const topHoldings = (holdings ?? [])
      .filter(h => latestRapor && h.rapor_yil === latestRapor.yil && h.rapor_ay === latestRapor.ay)
      .slice(0, 10)
      .map(h => ({ ticker: h.hisse_kodu, agirlik: h.yuzdesel_agirlik }));

    // Compute Sharpe/drawdown/volatility from TEFAS NAV history (existing Supabase table)
    let sharpe = null, maxDrawdown = null, volatility = null;
    try {
      const navHistory = await fetchFundHistory(code, 252);
      const prices = (navHistory || []).map(p => p.price ?? p.value ?? p.fiyat).filter(Boolean);
      if (prices.length >= 10) {
        sharpe = calculateSharpeRatio(prices);
        maxDrawdown = calculateMaxDrawdown(prices);
        volatility = calculateVolatility(prices);
      }
    } catch {
      // NAV history unavailable — metrics stay null
    }

    return res.status(200).json({
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
    });
  } catch (err) {
    console.error('[fund-profile] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
