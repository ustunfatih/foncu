const { fintablesQuery } = require('../fintables');
const supabase = require('../supabase');
const { upsertRows } = require('../sync-helpers');

async function syncFundProfiles(log) {
  log.push('Fetching fund profiles from Fintables...');

  const profileRows = await fintablesQuery(`
    SELECT DISTINCT ON (f.fon_kodu)
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
    LEFT JOIN gunluk_fon_degerleri gfd ON gfd.fon_kodu = f.fon_kodu
    WHERE f.fon_tipi IN ('mutual', 'pension', 'exchange')
    ORDER BY f.fon_kodu, gfd.tarih_europe_istanbul DESC
  `, 'syncing fund profiles');

  const profiles = profileRows.map((row) => ({
    fon_kodu: row.fon_kodu,
    unvan: row.unvan,
    fon_tipi: row.fon_tipi,
    portfoy_yonetim_sirketi: row.portfoy_yonetim_sirketi,
    risk_seviyesi: row.risk_seviyesi,
    stopaj: row.stopaj,
    yonetim_ucreti: row.yonetim_ucreti,
    alis_valoru: row.alis_valoru,
    satis_valoru: row.satis_valoru,
    fon_kategorisi: row.fon_kategorisi,
    semsiye_fon: row.semsiye_fon,
    tefasa_acik: row.tefasa_acik,
    pazar_payi: row.pazar_payi,
    fon_buyuklugu: row.fon_buyuklugu,
    yatirimci_sayisi: row.yatirimci_sayisi,
    guncelleme_zamani: new Date().toISOString(),
  }));

  const { count } = await upsertRows('fund_profiles', profiles, 'fon_kodu');
  log.push(`Upserted ${count} fund profiles`);

  return {
    profiles,
    profileCount: count,
  };
}

async function syncFundAllocations(log) {
  log.push('Fetching asset allocations...');

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const rows = await fintablesQuery(`
    SELECT fon_kodu, tarih_europe_istanbul, varlik_sinifi_kodu, varlik_sinifi, yuzdesel_agirlik
    FROM gunluk_fon_varlik_sinifi_dagilimlari
    WHERE tarih_europe_istanbul >= '${cutoffStr}'
    ORDER BY fon_kodu, tarih_europe_istanbul DESC, yuzdesel_agirlik DESC
  `, 'syncing asset allocations');

  const allocationByFund = {};
  for (const row of rows) {
    if (!allocationByFund[row.fon_kodu]) {
      allocationByFund[row.fon_kodu] = {
        tarih: row.tarih_europe_istanbul,
        items: [],
      };
    }
    if (row.tarih_europe_istanbul === allocationByFund[row.fon_kodu].tarih) {
      allocationByFund[row.fon_kodu].items.push({
        kod: row.varlik_sinifi_kodu,
        ad: row.varlik_sinifi,
        agirlik: row.yuzdesel_agirlik,
      });
    }
  }

  let updatedCount = 0;
  for (const [fon_kodu, { items }] of Object.entries(allocationByFund)) {
    const { error } = await supabase
      .from('fund_profiles')
      .update({
        varlik_dagilimi: items,
        guncelleme_zamani: new Date().toISOString(),
      })
      .eq('fon_kodu', fon_kodu);

    if (error) {
      throw new Error(`Failed to sync asset allocation for ${fon_kodu}: ${error.message}`);
    }
    updatedCount += 1;
  }

  log.push(`Updated asset allocations for ${updatedCount} funds`);
  return { allocationCount: updatedCount };
}

module.exports = {
  syncFundAllocations,
  syncFundProfiles,
};
