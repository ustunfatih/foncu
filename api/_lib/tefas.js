const ROOT_URL = 'https://fundturkey.com.tr';
const DETAIL_ENDPOINT = '/api/DB/BindHistoryAllocation';
const INFO_ENDPOINT = '/api/DB/BindHistoryInfo';

const defaultHeaders = {
  Connection: 'keep-alive',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  Origin: ROOT_URL,
  Referer: `${ROOT_URL}/TarihselVeriler.aspx`,
};

const formatDate = (input) => {
  const date = input instanceof Date ? input : new Date(input);
  const day = `${date.getDate()}`.padStart(2, '0');
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const toISO = (timestamp) => new Date(Number(timestamp)).toISOString().slice(0, 10);

const bootstrapSession = async () => {
  const response = await fetch(ROOT_URL, {
    headers: defaultHeaders,
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to prime TEFAS session: ${response.status} ${response.statusText}`);
  }

  const setCookie = response.headers.get('set-cookie');
  return setCookie ? setCookie.split(',').map((c) => c.split(';')[0].trim()).join('; ') : '';
};

const doPost = async (endpoint, data, cookie, retries = 3) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(`${ROOT_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          ...defaultHeaders,
          cookie,
        },
        body: new URLSearchParams(data),
      });

      if (!response.ok) {
        throw new Error(`TEFAS request failed: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      try {
        const json = JSON.parse(text);
        return json?.data ?? [];
      } catch (err) {
        console.error('[TEFAS] Invalid JSON response:', text.substring(0, 200));
        throw new Error('TEFAS returned invalid response. Service may be temporarily unavailable.');
      }
    } catch (err) {
      if (attempt === retries - 1) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`[TEFAS] Request failed, retrying in ${delay}ms... (Attempt ${attempt + 1}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

const fetchInfo = async ({ start, end, code = '', kind = 'YAT', cookie }) =>
  doPost(INFO_ENDPOINT, { fontip: kind, bastarih: start, bittarih: end, fonkod: code.toUpperCase() }, cookie);

const fetchAllocation = async ({ start, end, code = '', kind = 'YAT', cookie }) =>
  doPost(DETAIL_ENDPOINT, { fontip: kind, bastarih: start, bittarih: end, fonkod: code.toUpperCase() }, cookie);

module.exports = {
  ROOT_URL,
  DETAIL_ENDPOINT,
  INFO_ENDPOINT,
  defaultHeaders,
  formatDate,
  toISO,
  bootstrapSession,
  fetchInfo,
  fetchAllocation,
};
