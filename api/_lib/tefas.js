const ROOT_URL = 'https://www.tefas.gov.tr';
const DETAIL_ENDPOINT = '/api/funds/dagilimSiraliGetirT';
const INFO_ENDPOINT = '/api/funds/fonGnlBlgSiraliGetir';
const ANALYZE_ENDPOINT = '/api/funds/fonBilgiGetir';
const ANALYZE_URL = `${ROOT_URL}${ANALYZE_ENDPOINT}`;

const defaultHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
  Origin: ROOT_URL,
  Referer: `${ROOT_URL}/tr/fon-verileri`,
};

const formatDate = (input) => {
  const date = input instanceof Date ? input : new Date(input);
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}.${month}.${year}`;
};

const toISO = (timestamp) => {
  if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
    return timestamp;
  }
  return new Date(Number(timestamp)).toISOString().slice(0, 10);
};

const toApiDate = (date) => {
  if (!date) return null;
  const match = String(date).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (match) return `${match[3]}${match[2]}${match[1]}`;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid TEFAS date: ${date}`);
  }
  return parsed.toISOString().slice(0, 10).replaceAll('-', '');
};

const toLegacyTimestamp = (date) => {
  if (!date) return null;
  if (/^\d+$/.test(String(date))) return String(date);
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) ? String(timestamp) : null;
};

const buildRequestPayload = ({ fontip = 'YAT', fonkod = '', bastarih = null, bittarih = null } = {}) => ({
  fonTipi: String(fontip || 'YAT').toUpperCase(),
  fonKodu: String(fonkod || '').trim().toUpperCase() || null,
  aramaMetni: null,
  fonTurKod: null,
  fonGrubu: null,
  sfonTurKod: null,
  basTarih: toApiDate(bastarih),
  bitTarih: toApiDate(bittarih),
  basSira: 1,
  bitSira: 9999,
  fonTurAciklama: null,
  dil: 'TR',
  kurucuKod: null,
  sira: null,
  yon: null,
});

const normalizeInfoRow = (row = {}) => ({
  FONKODU: row.fonKodu,
  FONUNVAN: row.fonUnvan,
  TARIH: toLegacyTimestamp(row.tarih),
  FIYAT: row.fiyat,
  PORTFOYBUYUKLUK: row.portfoyBuyukluk,
  TEDPAY: row.tedPaySayisi,
  KISISAYISI: row.kisiSayisi,
  BORSABULTENFIYAT: row.borsaBultenFiyat,
});

const ALLOCATION_KEY_ALIASES = {
  dot: 'DÖT',
  kibd: 'KİBD',
  oksyd: 'ÖKSYD',
  osdb: 'ÖSDB',
};

const normalizeAllocationRow = (row = {}) => {
  const normalized = {
    TARIH: toLegacyTimestamp(row.tarih),
    FONKODU: row.fonKodu,
    FONUNVAN: row.fonUnvan,
    BilFiyat: row.bilFiyat,
  };

  for (const [key, value] of Object.entries(row)) {
    if (['tarih', 'fonKodu', 'fonUnvan', 'bilFiyat', 'rn'].includes(key)) continue;
    normalized[ALLOCATION_KEY_ALIASES[key] || key.toLocaleUpperCase('tr-TR')] = value;
  }

  return normalized;
};

const bootstrapSession = async () => {
  try {
    const response = await fetch(`${ROOT_URL}/tr/fon-verileri`, {
      headers: defaultHeaders,
      redirect: 'follow',
    });

    if (!response.ok) {
      console.warn(`[TEFAS] Session bootstrap returned ${response.status}; continuing without a cookie.`);
      return '';
    }

    const setCookie = response.headers.get('set-cookie');
    return setCookie ? setCookie.split(',').map((c) => c.split(';')[0].trim()).join('; ') : '';
  } catch (error) {
    console.warn(`[TEFAS] Session bootstrap failed; continuing without a cookie: ${error.message}`);
    return '';
  }
};

const doPost = async (endpoint, data, cookie, normalizeRow = (row) => row, retries = 3) => {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const headers = { ...defaultHeaders };
      if (cookie) headers.cookie = cookie;

      const response = await fetch(`${ROOT_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildRequestPayload(data)),
      });

      if (!response.ok) {
        throw new Error(`TEFAS request failed: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (error) {
        console.error('[TEFAS] Invalid JSON response:', text.substring(0, 200));
        throw new Error('TEFAS returned invalid response. Service may be temporarily unavailable.');
      }

      if (json?.errorCode || json?.errorMessage) {
        throw new Error(`TEFAS API error: ${json.errorMessage || json.errorCode}`);
      }

      return (json?.resultList || []).map(normalizeRow);
    } catch (error) {
      if (attempt === retries - 1) throw error;
      const delay = 2 ** attempt * 1000;
      console.warn(`[TEFAS] Request failed, retrying in ${delay}ms... (Attempt ${attempt + 1}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return [];
};

const fetchInfo = async ({ start, end, code = '', kind = 'YAT', cookie }) =>
  doPost(
    INFO_ENDPOINT,
    { fontip: kind, bastarih: start, bittarih: end, fonkod: code },
    cookie,
    normalizeInfoRow
  );

const fetchAllocation = async ({ start, end, code = '', kind = 'YAT', cookie }) =>
  doPost(
    DETAIL_ENDPOINT,
    { fontip: kind, bastarih: start, bittarih: end, fonkod: code },
    cookie,
    normalizeAllocationRow
  );

const fetchAnalyzeData = async (code) => {
  const normalizedCode = (code || '').toString().trim().toUpperCase();
  if (!normalizedCode) {
    throw new Error('fund code is required for TEFAS analyze data');
  }

  const rows = await doPost(ANALYZE_ENDPOINT, {
    fontip: 'YAT',
    fonkod: normalizedCode,
  }, '', (row) => row);
  const row = rows[0] || {};

  return {
    fundInfo: [{
      FONKODU: row.fonKodu,
      FONUNVAN: row.fonUnvan,
      FONKATEGORI: row.fonKategori,
      PORTBUYUKLUK: row.portBuyukluk,
      YATIRIMCISAYI: row.yatirimciSayi,
      PAZARPAYI: row.pazarPayi,
    }],
    fundReturn: [{ GETIRI1G: row.gunlukGetiri }],
    fundProfile: [],
    fundAllocation: [],
  };
};

module.exports = {
  ROOT_URL,
  DETAIL_ENDPOINT,
  INFO_ENDPOINT,
  ANALYZE_URL,
  defaultHeaders,
  formatDate,
  toISO,
  toApiDate,
  buildRequestPayload,
  normalizeInfoRow,
  normalizeAllocationRow,
  bootstrapSession,
  fetchInfo,
  fetchAllocation,
  fetchAnalyzeData,
};
