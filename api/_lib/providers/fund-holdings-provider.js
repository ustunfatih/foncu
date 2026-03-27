const { fintablesQueryAll } = require('../fintables');
const { upsertRows } = require('../sync-helpers');

const HOLDINGS_SQL = `
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
  ORDER BY lr.fon_kodu, sa.yuzdesel_agirlik DESC`;

async function syncFundHoldings(log, token) {
  log.push('Fetching fund holdings...');

  const [latestReportPeriod] = await fintablesQuery(`
    SELECT
      yil AS rapor_yil,
      ay AS rapor_ay,
      COUNT(DISTINCT fon_kodu) AS fund_count
    FROM fon_portfoy_dagilim_raporlari
    GROUP BY yil, ay
    ORDER BY yil DESC, ay DESC
    LIMIT 1
  `, 'discovering latest fund holdings report period');

  if (!latestReportPeriod?.rapor_yil || !latestReportPeriod?.rapor_ay) {
    throw new Error('No monthly holdings report period found in Fintables');
  }

  log.push(`Using holdings report period ${latestReportPeriod.rapor_ay}/${latestReportPeriod.rapor_yil}`);

  const holdingRows = await fintablesQuery(`
    WITH target_reports AS (
      SELECT
        fon_portfoy_dagilim_raporu_id,
        fon_kodu,
        ay,
        yil
      FROM fon_portfoy_dagilim_raporlari
      WHERE yil = ${Number(latestReportPeriod.rapor_yil)}
        AND ay = ${Number(latestReportPeriod.rapor_ay)}
    )
    SELECT
      tr.fon_kodu,
      sa.fon_kodu AS hisse_kodu,
      sa.yuzdesel_agirlik,
      sa.fondaki_lot,
      tr.ay AS rapor_ay,
      tr.yil AS rapor_yil
    FROM target_reports tr
    JOIN fon_portfoy_dagilim_raporu_sembol_agirliklari sa
      ON sa.fon_portfoy_dagilim_raporu_id = tr.fon_portfoy_dagilim_raporu_id
    JOIN hisse_senetleri hs
      ON hs.hisse_senedi_kodu = sa.fon_kodu
    WHERE sa.yuzdesel_agirlik > 0
  `, 'syncing fund holdings');

  const holdings = holdingRows.map((row) => ({
    fon_kodu: row.fon_kodu,
    hisse_kodu: row.hisse_kodu,
    yuzdesel_agirlik: row.yuzdesel_agirlik,
    fondaki_lot: row.fondaki_lot,
    asset_type: 'equity',
    rapor_ay: row.rapor_ay,
    rapor_yil: row.rapor_yil,
    guncelleme_zamani: new Date().toISOString(),
  }));

  const { count } = await upsertRows(
    'fund_holdings',
    holdings,
    'fon_kodu,hisse_kodu,rapor_yil,rapor_ay'
  );

  await upsertRows(
    'fund_holdings_snapshots',
    [{
      rapor_yil: latestReportPeriod.rapor_yil,
      rapor_ay: latestReportPeriod.rapor_ay,
      acquired_at: new Date().toISOString(),
      source: 'fintables',
      fund_count: Number(latestReportPeriod.fund_count ?? 0),
      holding_count: holdings.length,
      status: 'ready',
      updated_at: new Date().toISOString(),
    }],
    'rapor_yil,rapor_ay'
  );

  log.push(`Upserted ${count} fund holdings for ${latestReportPeriod.rapor_ay}/${latestReportPeriod.rapor_yil}`);
  return {
    holdingCount: count,
    reportPeriod: {
      yil: latestReportPeriod.rapor_yil,
      ay: latestReportPeriod.rapor_ay,
    },
  };
}

async function syncKapEvents(log, token) {
  log.push('Fetching KAP events...');

  const { fintablesQuery } = require('../fintables');
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
  `, 'syncing dividend events', token);

  const kapEvents = dividendRows.map((row) => ({
    olay_tarihi: row.olay_tarihi,
    olay_tipi: 'temettu',
    hisse_kodu: row.hisse_senedi_kodu,
    baslik: `${row.hisse_senedi_kodu} Temettü Ex-Date`,
    deger: `₺${row.brut_hisse_basi_temettu?.toFixed(2)} brüt · %${row.temettu_verimi?.toFixed(1)} verim`,
    guncelleme_zamani: new Date().toISOString(),
  }));

  if (kapEvents.length > 0) {
    await upsertRows('kap_events', kapEvents, 'olay_tarihi,olay_tipi,hisse_kodu');
  }

  log.push(`Upserted ${kapEvents.length} dividend events`);
  return { kapEventCount: kapEvents.length };
}

module.exports = {
  syncFundHoldings,
  syncKapEvents,
};
