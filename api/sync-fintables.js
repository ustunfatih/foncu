const { fintablesQuery } = require('./_lib/fintables');
const { upsertRows, computeRsi14, computeSma, rsiToSignal } = require('./_lib/sync-helpers');
const supabase = require('./_lib/supabase');

function computeReturn(entries, offsetDays) {
  if (!entries || entries.length < offsetDays + 1) return null;
  const latest = entries[entries.length - 1].price;
  const past = entries[Math.max(0, entries.length - 1 - offsetDays)].price;
  if (!past || past === 0) return null;
  return parseFloat(((latest / past - 1) * 100).toFixed(4));
}

function computeYtdReturn(entries) {
  if (!entries || entries.length < 2) return null;
  const latest = entries[entries.length - 1];
  const currentYear = new Date().getFullYear();
  const prevYear = entries.filter(e => new Date(e.date).getFullYear() < currentYear);
  if (prevYear.length === 0) return null;
  const base = prevYear[prevYear.length - 1].price;
  if (!base || base === 0) return null;
  return parseFloat(((latest.price / base - 1) * 100).toFixed(4));
}

const CRON_SECRET = process.env.CRON_SECRET;

module.exports = async (req, res) => {
  // Auth: allow Vercel Cron (no auth header) or manual trigger with secret
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isManual = req.query.secret === CRON_SECRET && !!CRON_SECRET;
  if (!isVercelCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const log = [];
  const start = Date.now();

  try {
    // ── 1. Sync fund_profiles ──────────────────────────────────────────────
    log.push('Fetching fund profiles from Fintables...');
    const profileRows = await fintablesQuery(`
      SELECT
        f.fon_kodu,
        f.unvan,
        f.fon_tipi,
        p.unvan AS portfoy_yonetim_sirketi,
        f.risk_seviyesi,
        f.stopaj,
        f.yonetim_ucreti,
        f.alis_valoru,
        f.satis_valoru,
        f.semsiye_fon,
        f.tefasa_acik,
        f.pazar_payi,
        fk.baslik AS fon_kategorisi,
        COALESCE(gfd.fon_buyuklugu, 0) AS fon_buyuklugu,
        COALESCE(gfd.yatirimci_sayisi, 0) AS yatirimci_sayisi
      FROM fonlar f
      LEFT JOIN portfoy_yonetim_sirketleri p
        ON p.portfoy_yonetim_sirketi_kodu = f.portfoy_yonetim_sirketi_kodu
      LEFT JOIN fon_kategori_iliskileri fki ON fki.fon_kodu = f.fon_kodu
      LEFT JOIN fon_kategorileri fk ON fk.fon_kategori_id = fki.fon_kategori_id
      LEFT JOIN LATERAL (
        SELECT fon_buyuklugu, yatirimci_sayisi
        FROM gunluk_fon_degerleri
        WHERE fon_kodu = f.fon_kodu
        ORDER BY tarih_europe_istanbul DESC
        LIMIT 1
      ) gfd ON true
      WHERE f.fon_tipi IN ('mutual', 'pension', 'exchange')
    `, 'syncing fund profiles');

    const profiles = profileRows.map(r => ({
      fon_kodu: r.fon_kodu,
      unvan: r.unvan,
      fon_tipi: r.fon_tipi,
      portfoy_yonetim_sirketi: r.portfoy_yonetim_sirketi,
      risk_seviyesi: r.risk_seviyesi,
      stopaj: r.stopaj,
      yonetim_ucreti: r.yonetim_ucreti,
      alis_valoru: r.alis_valoru,
      satis_valoru: r.satis_valoru,
      fon_kategorisi: r.fon_kategorisi,
      semsiye_fon: r.semsiye_fon,
      tefasa_acik: r.tefasa_acik,
      pazar_payi: r.pazar_payi,
      fon_buyuklugu: r.fon_buyuklugu,
      yatirimci_sayisi: r.yatirimci_sayisi,
      guncelleme_zamani: new Date().toISOString()
    }));

    const { count: profileCount } = await upsertRows('fund_profiles', profiles, 'fon_kodu');
    log.push(`Upserted ${profileCount} fund profiles`);

    // ── 2. Sync asset allocation into fund_profiles ────────────────────────
    log.push('Fetching asset allocations...');
    const allocRows = await fintablesQuery(`
      SELECT DISTINCT ON (fon_kodu)
        fon_kodu,
        tarih_europe_istanbul,
        json_agg(json_build_object(
          'kod', varlik_sinifi_kodu,
          'ad', varlik_sinifi,
          'agirlik', yuzdesel_agirlik
        ) ORDER BY yuzdesel_agirlik DESC) AS dagilim
      FROM gunluk_fon_varlik_sinifi_dagilimlari
      GROUP BY fon_kodu, tarih_europe_istanbul
      ORDER BY fon_kodu, tarih_europe_istanbul DESC
    `, 'syncing asset allocations');

    for (const row of allocRows) {
      await supabase
        .from('fund_profiles')
        .update({ varlik_dagilimi: row.dagilim })
        .eq('fon_kodu', row.fon_kodu);
    }
    log.push(`Updated asset allocations for ${allocRows.length} funds`);

    // ── 3. Sync returns + technical indicators into fund_profiles ──────────
    log.push('Fetching OHLCV data for technical indicators and returns...');
    const ohlcvRows = await fintablesQuery(`
      SELECT
        fon_kodu,
        tarih_europe_istanbul AS tarih,
        fiyat
      FROM gunluk_fon_degerleri
      WHERE tarih_europe_istanbul >= CURRENT_DATE - INTERVAL '252 days'
      ORDER BY fon_kodu, tarih_europe_istanbul ASC
    `, 'syncing OHLCV for technicals');

    // Group prices by fund (store date+price for return calculations)
    const pricesByFund = {};
    for (const row of ohlcvRows) {
      if (!pricesByFund[row.fon_kodu]) pricesByFund[row.fon_kodu] = [];
      if (row.fiyat != null) pricesByFund[row.fon_kodu].push({ date: row.tarih, price: row.fiyat });
    }

    // Compute and update indicators per fund in batches
    const indicatorUpdates = Object.entries(pricesByFund).map(([fon_kodu, entries]) => {
      const prices = entries.map(e => e.price);
      const sma20 = computeSma(prices, 20);
      const sma50 = computeSma(prices, 50);
      const sma200 = computeSma(prices, 200);
      const rsi14 = computeRsi14(prices);
      const sonFiyat = prices[prices.length - 1] ?? null;

      // SMA(20/50) crossover: check if SMA20 crossed above SMA50 in last 5 days
      // Simplified: compare current vs 5-day-ago window
      const smaCrossover = (() => {
        if (prices.length < 55) return false;
        const prevSma20 = computeSma(prices.slice(0, -5), 20);
        const prevSma50 = computeSma(prices.slice(0, -5), 50);
        if (prevSma20 === null || prevSma50 === null || sma20 === null || sma50 === null) return false;
        return prevSma20 < prevSma50 && sma20 > sma50;
      })();

      return {
        fon_kodu,
        rsi_14: rsi14,
        sma_20: sma20,
        sma_50: sma50,
        sma_200: sma200,
        son_fiyat: sonFiyat,
        ma200_ustu: sma200 !== null && sonFiyat !== null ? sonFiyat > sma200 : null,
        sma_kesisim_20_50: smaCrossover,
        rsi_sinyal: rsiToSignal(rsi14),
        getiri_1g:  computeReturn(entries, 1),
        getiri_1h:  computeReturn(entries, 5),
        getiri_1a:  computeReturn(entries, 21),
        getiri_3a:  computeReturn(entries, 63),
        getiri_6a:  computeReturn(entries, 126),
        getiri_ytd: computeYtdReturn(entries),
        getiri_1y:  computeReturn(entries, 252),
      };
    });

    // Upsert indicator data into fund_profiles
    if (indicatorUpdates.length > 0) {
      await upsertRows('fund_profiles', indicatorUpdates, 'fon_kodu');
    }
    log.push(`Updated technical indicators for ${indicatorUpdates.length} funds`);

    // ── 4. Sync fund_holdings (latest monthly reports) ─────────────────────
    log.push('Fetching fund holdings...');
    const holdingRows = await fintablesQuery(`
      WITH latest_reports AS (
        SELECT DISTINCT ON (fon_kodu)
          fon_portfoy_dagilim_raporu_id,
          fon_kodu,
          ay,
          yil
        FROM fon_portfoy_dagilim_raporlari
        ORDER BY fon_kodu, yil DESC, ay DESC
      )
      SELECT
        lr.fon_kodu,
        sa.fon_kodu AS hisse_kodu,
        sa.yuzdesel_agirlik,
        sa.fondaki_lot,
        lr.ay AS rapor_ay,
        lr.yil AS rapor_yil
      FROM latest_reports lr
      JOIN fon_portfoy_dagilim_raporu_sembol_agirliklari sa
        ON sa.fon_portfoy_dagilim_raporu_id = lr.fon_portfoy_dagilim_raporu_id
      JOIN hisse_senetleri hs
        ON hs.hisse_senedi_kodu = sa.fon_kodu
      WHERE sa.yuzdesel_agirlik > 0
    `, 'syncing fund holdings');

    const holdings = holdingRows.map(r => ({
      fon_kodu: r.fon_kodu,
      hisse_kodu: r.hisse_kodu,
      yuzdesel_agirlik: r.yuzdesel_agirlik,
      fondaki_lot: r.fondaki_lot,
      asset_type: 'equity',
      rapor_ay: r.rapor_ay,
      rapor_yil: r.rapor_yil,
      guncelleme_zamani: new Date().toISOString()
    }));

    const { count: holdingCount } = await upsertRows(
      'fund_holdings',
      holdings,
      'fon_kodu,hisse_kodu,rapor_yil,rapor_ay'
    );
    log.push(`Upserted ${holdingCount} fund holdings`);

    // ── 5. Sync kap_events (dividend ex-dates, 90-day window) ──────────────
    log.push('Fetching KAP events...');
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const dividendRows = await fintablesQuery(`
      SELECT
        hisse_senedi_kodu,
        tarih_europe_istanbul AS olay_tarihi,
        brut_hisse_basi_temettu,
        net_hisse_basi_temettu,
        temettu_verimi
      FROM hisse_senedi_temettuler
      WHERE tarih_europe_istanbul BETWEEN '${today}' AND '${futureDate}'
        AND odendi = false
      ORDER BY tarih_europe_istanbul
    `, 'syncing dividend events');

    const kapEvents = dividendRows.map(r => ({
      olay_tarihi: r.olay_tarihi,
      olay_tipi: 'temettu',
      hisse_kodu: r.hisse_senedi_kodu,
      baslik: `${r.hisse_senedi_kodu} Temettü Ex-Date`,
      deger: `₺${r.brut_hisse_basi_temettu?.toFixed(2)} brüt · %${r.temettu_verimi?.toFixed(1)} verim`,
      guncelleme_zamani: new Date().toISOString()
    }));

    if (kapEvents.length) {
      await upsertRows('kap_events', kapEvents, 'olay_tarihi,olay_tipi,hisse_kodu');
    }
    log.push(`Upserted ${kapEvents.length} dividend events`);

    const elapsed = Date.now() - start;
    return res.status(200).json({ ok: true, elapsed, log });

  } catch (err) {
    console.error('[sync-fintables] Error:', err);
    return res.status(500).json({ ok: false, error: err.message, log });
  }
};
