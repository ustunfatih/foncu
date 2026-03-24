const {
  bootstrapSession,
  fetchInfo,
  formatDate,
} = require('./_lib/tefas');
const { upsertRows, computeRsi14, computeSma, rsiToSignal } = require('./_lib/sync-helpers');

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

const FUND_TYPES = [
  { kind: 'YAT', fon_tipi: 'mutual' },
  { kind: 'EMK', fon_tipi: 'pension' },
  { kind: 'BYF', fon_tipi: 'exchange' },
];

module.exports = async (req, res) => {
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isManual = req.query.secret === CRON_SECRET && !!CRON_SECRET;
  if (!isVercelCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const log = [];
  const startTime = Date.now();

  try {
    log.push('Bootstrapping TEFAS session...');
    const cookie = await bootstrapSession();

    // ── Fetch 90-day price history for ALL funds ─────────────────────────
    // 90 days is TEFAS's max per request. Covers getiri_1g/1h/1a/3a + YTD + RSI/SMA.
    // All 3 fund types fetched IN PARALLEL to fit within Vercel 10s timeout.
    const today = new Date();
    const start90 = new Date(today);
    start90.setDate(start90.getDate() - 90);
    const startStr = formatDate(start90);
    const endStr = formatDate(today);

    log.push(`Fetching BindHistoryInfo ${startStr} → ${endStr} (3 types in parallel)...`);

    const results = await Promise.all(
      FUND_TYPES.map(({ kind, fon_tipi }) =>
        fetchInfo({ start: startStr, end: endStr, code: '', kind, cookie })
          .then(rows => ({ kind, fon_tipi, rows }))
      )
    );

    const fundData = {};
    let totalRows = 0;
    let debugLogged = false;

    for (const { fon_tipi, rows } of results) {
      if (rows.length === 0) continue;
      if (!debugLogged) {
        log.push(`  [DEBUG] Fields: ${Object.keys(rows[0]).join(', ')}`);
        debugLogged = true;
      }
      for (const row of rows) {
        const code = row.FONKODU || row.FONKOD;
        if (!code || row.FIYAT == null) continue;
        if (!fundData[code]) {
          fundData[code] = { fon_tipi, unvan: row.FONUNVAN || null, entries: [] };
        }
        if (row.FONUNVAN) fundData[code].unvan = row.FONUNVAN;
        fundData[code].entries.push({
          date: new Date(Number(row.TARIH)).toISOString().slice(0, 10),
          price: Number(row.FIYAT),
          marketCap: row.PORTFOYBUYUKLUK != null ? Number(row.PORTFOYBUYUKLUK) : null,
          investorCount: row.KISISAYISI != null ? Number(row.KISISAYISI) : null,
        });
        totalRows++;
      }
    }

    const fundCount = Object.keys(fundData).length;
    log.push(`Collected ${totalRows} rows for ${fundCount} funds (${Date.now() - startTime}ms)`);

    if (fundCount === 0) {
      throw new Error('No fund data from TEFAS — empty fonkod may not return FONKODU field. Check [DEBUG] log.');
    }

    // Deduplicate + sort
    for (const code of Object.keys(fundData)) {
      const seen = new Set();
      fundData[code].entries = fundData[code].entries
        .filter(e => { if (seen.has(e.date)) return false; seen.add(e.date); return true; })
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    // Build upsert rows
    const profileUpdates = Object.entries(fundData).map(([fon_kodu, { fon_tipi, unvan, entries }]) => {
      const prices = entries.map(e => e.price);
      const latest = entries[entries.length - 1];
      const sma20 = computeSma(prices, 20);
      const sma50 = computeSma(prices, 50);
      const rsi14 = computeRsi14(prices);
      const sonFiyat = prices[prices.length - 1] ?? null;

      const row = {
        fon_kodu,
        fon_tipi,
        son_fiyat: sonFiyat,
        rsi_14: rsi14,
        sma_20: sma20,
        sma_50: sma50,
        sma_200: null,
        ma200_ustu: null,
        sma_kesisim_20_50: false,
        rsi_sinyal: rsiToSignal(rsi14),
        getiri_1g:  computeReturn(entries, 1),
        getiri_1h:  computeReturn(entries, 5),
        getiri_1a:  computeReturn(entries, 21),
        getiri_3a:  computeReturn(entries, 63),
        getiri_6a:  null,  // needs 126+ trading days
        getiri_ytd: computeYtdReturn(entries),
        getiri_1y:  null,  // needs 252+ trading days
        guncelleme_zamani: new Date().toISOString(),
      };

      if (unvan) row.unvan = unvan;
      if (latest.marketCap != null) row.fon_buyuklugu = latest.marketCap;
      if (latest.investorCount != null) row.yatirimci_sayisi = latest.investorCount;
      return row;
    });

    const { count: profileCount } = await upsertRows('fund_profiles', profileUpdates, 'fon_kodu');
    log.push(`Upserted ${profileCount} fund profiles (${Date.now() - startTime}ms)`);

    const elapsed = Date.now() - startTime;
    return res.status(200).json({ ok: true, elapsed, log });

  } catch (err) {
    console.error('[sync-fintables] Error:', err);
    return res.status(500).json({ ok: false, error: err.message, log });
  }
};
