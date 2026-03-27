const supabase = require('../supabase');
const { bootstrapSession, fetchInfo, fetchAllocation, fetchAnalyzeData, formatDate } = require('../tefas');
const { upsertRows } = require('../sync-helpers');

const FUND_KIND_MAP = {
  YAT: 'mutual',
  EMK: 'pension',
  BYF: 'exchange',
};

const ASSET_TYPE_LABELS = {
  BB: 'Banka Bonosu',
  BPP: 'Borsa Para Piyasası',
  BTAA: 'Taahhütlü Alış',
  BTAS: 'Taahhütlü Satış',
  BYF: 'Borsa Yatırım Fonu',
  D: 'Döviz',
  DB: 'Devlet Bonosu',
  DT: 'Devlet Tahvili',
  'DÖT': 'Döviz Ödemeli Tahvil',
  EUT: 'Eurobond Tahvil',
  FB: 'Finansman Bonosu',
  FKB: 'Fon Katılma Belgesi',
  GAS: 'Gümüş',
  GSYKB: 'Girişim Sermayesi Yatırım Katılma Belgesi',
  GSYY: 'Girişim Sermayesi Yatırımı',
  GYKB: 'Gayrimenkul Yatırım Katılma Belgesi',
  GYY: 'Gayrimenkul Yatırımı',
  HB: 'Hazine Bonosu',
  HS: 'Hisse Senedi',
  KBA: 'Katılma Belgesi Alım',
  KH: 'Katılım Hesabı',
  KHAU: 'Katılım Hesabı ABD Doları',
  KHD: 'Katılım Hesabı Döviz',
  KHTL: 'Katılım Hesabı Türk Lirası',
  KKS: 'Kira Sertifikası',
  KKSD: 'Kira Sertifikası Döviz',
  KKSTL: 'Kira Sertifikası Türk Lirası',
  KKSYD: 'Kira Sertifikası Yabancı Döviz',
  KM: 'Kıymetli Maden',
  KMBYF: 'Kıymetli Maden BYF',
  KMKBA: 'Kıymetli Maden Katılma Belgesi',
  KMKKS: 'Kıymetli Maden Kira Sertifikası',
  'KİBD': 'İpotekli Borçlanma Aracı',
  OSKS: 'Özel Sektör Kira Sertifikası',
  OST: 'Özel Sektör Tahvili',
  R: 'Repo',
  T: 'Tahvil',
  TPP: 'Takasbank Para Piyasası',
  TR: 'Ters Repo',
  VDM: 'Vadeli Mevduat',
  VM: 'Vadesiz Mevduat',
  VMAU: 'Vadesiz Mevduat ABD Doları',
  VMD: 'Vadesiz Mevduat Döviz',
  VMTL: 'Vadesiz Mevduat Türk Lirası',
  'VİNT': 'Varlık İpotekli Menkul Kıymet',
  YBA: 'Yabancı Borçlanma Araçları',
  YBKB: 'Yabancı Borsa Katılma Belgesi',
  YBOSB: 'Yabancı Borsa Özel Sektör Bonosu',
  YBYF: 'Yabancı Borsa Yatırım Fonu',
  YHS: 'Yabancı Hisse Senedi',
  YMK: 'Yabancı Menkul Kıymet',
  YYF: 'Yabancı Yatırım Fonu',
  'ÖKSYD': 'Özel Sektör Kira Sertifikası Yabancı Döviz',
  'ÖSDB': 'Özel Sektör Devlet Bonosu',
};

function normalizeNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function loadExistingProfiles() {
  const { data, error } = await supabase
    .from('fund_profiles')
    .select('*');

  if (error) {
    throw new Error(`Failed to read existing fund profiles: ${error.message}`);
  }

  return new Map((data || []).map((row) => [row.fon_kodu, row]));
}

async function fetchLatestSnapshotRows(fetcher, kind, cookie, log, label) {
  for (let daysBack = 0; daysBack < 7; daysBack += 1) {
    const asOf = new Date();
    asOf.setUTCDate(asOf.getUTCDate() - daysBack);
    const date = formatDate(asOf);
    const rows = await fetcher({
      start: date,
      end: date,
      kind,
      cookie,
    });

    if (Array.isArray(rows) && rows.length > 0) {
      log.push(`Using TEFAS ${label} snapshot for ${kind} from ${date}`);
      return { date, rows };
    }
  }

  throw new Error(`No TEFAS ${label} snapshot found for ${kind} in the last 7 days`);
}

function buildProfileRow(row, kind, existingByCode, refreshedAt) {
  const code = row.FONKODU?.toUpperCase();
  const existing = existingByCode.get(code) || {};

  return {
    fon_kodu: code,
    unvan: row.FONUNVAN || existing.unvan || code,
    fon_tipi: FUND_KIND_MAP[kind] || existing.fon_tipi || null,
    portfoy_yonetim_sirketi: existing.portfoy_yonetim_sirketi ?? null,
    risk_seviyesi: existing.risk_seviyesi ?? null,
    stopaj: existing.stopaj ?? null,
    yonetim_ucreti: existing.yonetim_ucreti ?? null,
    alis_valoru: existing.alis_valoru ?? null,
    satis_valoru: existing.satis_valoru ?? null,
    fon_kategorisi: existing.fon_kategorisi ?? null,
    semsiye_fon: existing.semsiye_fon ?? null,
    tefasa_acik: existing.tefasa_acik ?? true,
    pazar_payi: normalizeNumber(existing.pazar_payi),
    fon_buyuklugu: normalizeNumber(row.PORTFOYBUYUKLUK) ?? normalizeNumber(existing.fon_buyuklugu),
    yatirimci_sayisi: normalizeNumber(row.KISISAYISI) ?? normalizeNumber(existing.yatirimci_sayisi),
    son_fiyat: normalizeNumber(row.FIYAT) ?? normalizeNumber(existing.son_fiyat),
    varlik_dagilimi: existing.varlik_dagilimi ?? [],
    kap_link: existing.kap_link ?? null,
    kap_fund_id: existing.kap_fund_id ?? null,
    guncelleme_zamani: refreshedAt,
  };
}

function buildAllocationItems(row) {
  const items = Object.entries(row)
    .filter(([key, value]) => !['TARIH', 'FONKODU', 'FONUNVAN', 'BilFiyat'].includes(key) && value != null)
    .map(([key, value]) => ({
      kod: key,
      ad: ASSET_TYPE_LABELS[key] || key,
      agirlik: Number(value),
    }))
    .filter((item) => Number.isFinite(item.agirlik) && item.agirlik !== 0)
    .sort((a, b) => b.agirlik - a.agirlik);

  return items;
}

async function syncFundProfiles(log) {
  log.push('Fetching fund profiles from public TEFAS snapshots...');

  const cookie = await bootstrapSession();
  const existingByCode = await loadExistingProfiles();
  const refreshedAt = new Date().toISOString();

  const kinds = Object.keys(FUND_KIND_MAP);
  const snapshots = await Promise.all(
    kinds.map((kind) => fetchLatestSnapshotRows(fetchInfo, kind, cookie, log, 'fund info'))
  );

  const profiles = [];
  for (let index = 0; index < kinds.length; index += 1) {
    const kind = kinds[index];
    const snapshot = snapshots[index];
    for (const row of snapshot.rows) {
      if (!row?.FONKODU) continue;
      profiles.push(buildProfileRow(row, kind, existingByCode, refreshedAt));
    }
  }

  const dedupedProfiles = Array.from(
    profiles.reduce((map, row) => map.set(row.fon_kodu, row), new Map()).values()
  );

  const { count } = await upsertRows('fund_profiles', dedupedProfiles, 'fon_kodu');
  log.push(`Upserted ${count} fund profiles from public TEFAS`);

  return {
    profiles: dedupedProfiles,
    profileCount: count,
  };
}

async function syncFundAllocations(log) {
  log.push('Fetching asset allocations from public TEFAS snapshots...');

  const cookie = await bootstrapSession();
  const kinds = Object.keys(FUND_KIND_MAP);
  const snapshots = await Promise.all(
    kinds.map((kind) => fetchLatestSnapshotRows(fetchAllocation, kind, cookie, log, 'allocation'))
  );

  const updates = [];
  for (const snapshot of snapshots) {
    for (const row of snapshot.rows) {
      if (!row?.FONKODU) continue;
      updates.push({
        fon_kodu: row.FONKODU.toUpperCase(),
        varlik_dagilimi: buildAllocationItems(row),
        guncelleme_zamani: new Date().toISOString(),
      });
    }
  }

  const dedupedUpdates = Array.from(
    updates.reduce((map, row) => map.set(row.fon_kodu, row), new Map()).values()
  );

  const { count } = await upsertRows('fund_profiles', dedupedUpdates, 'fon_kodu');
  log.push(`Updated asset allocations for ${count} funds from public TEFAS`);
  return { allocationCount: count };
}

async function enrichFundProfileFromPublicTefas(code, existingProfile = null) {
  const normalizedCode = (code || '').toString().trim().toUpperCase();
  if (!normalizedCode) {
    throw new Error('Fund code is required for TEFAS enrichment');
  }

  const response = await fetchAnalyzeData(normalizedCode);
  const fundInfo = response?.fundInfo?.[0] || {};
  const fundReturn = response?.fundReturn?.[0] || {};
  const fundProfile = response?.fundProfile?.[0] || {};
  const fundAllocation = response?.fundAllocation || [];

  const merged = {
    ...(existingProfile || {}),
    fon_kodu: normalizedCode,
    unvan: fundInfo.FONUNVAN || existingProfile?.unvan || normalizedCode,
    fon_kategorisi: fundInfo.FONKATEGORI || existingProfile?.fon_kategorisi || null,
    risk_seviyesi: normalizeNumber(fundProfile.RISKDEGERI) ?? existingProfile?.risk_seviyesi ?? null,
    portfoy_yonetim_sirketi: fundInfo.YONETICI || existingProfile?.portfoy_yonetim_sirketi || null,
    pazar_payi: normalizeNumber(fundInfo.PAZARPAYI) ?? existingProfile?.pazar_payi ?? null,
    fon_buyuklugu: normalizeNumber(fundInfo.PORTBUYUKLUK) ?? existingProfile?.fon_buyuklugu ?? null,
    yatirimci_sayisi: normalizeNumber(fundInfo.YATIRIMCISAYI) ?? existingProfile?.yatirimci_sayisi ?? null,
    alis_valoru: normalizeNumber(fundProfile.FONSATISVALOR) ?? existingProfile?.alis_valoru ?? null,
    satis_valoru: normalizeNumber(fundProfile.FONGERIALISVALOR) ?? existingProfile?.satis_valoru ?? null,
    kap_link: fundProfile.KAPLINK || existingProfile?.kap_link || null,
    varlik_dagilimi: Array.isArray(fundAllocation)
      ? fundAllocation
        .map((item) => ({
          kod: item.KIYMETTIP,
          ad: item.KIYMETTIP,
          agirlik: Number(item.PORTFOYORANI),
        }))
        .filter((item) => Number.isFinite(item.agirlik))
        .sort((a, b) => b.agirlik - a.agirlik)
      : (existingProfile?.varlik_dagilimi || []),
    getiri_1a: normalizeNumber(fundReturn.GETIRI1A) ?? existingProfile?.getiri_1a ?? null,
    getiri_3a: normalizeNumber(fundReturn.GETIRI3A) ?? existingProfile?.getiri_3a ?? null,
    getiri_6a: normalizeNumber(fundReturn.GETIRI6A) ?? existingProfile?.getiri_6a ?? null,
    getiri_1y: normalizeNumber(fundReturn.GETIRI1Y) ?? existingProfile?.getiri_1y ?? null,
    guncelleme_zamani: new Date().toISOString(),
  };

  return merged;
}

module.exports = {
  enrichFundProfileFromPublicTefas,
  syncFundAllocations,
  syncFundProfiles,
};
