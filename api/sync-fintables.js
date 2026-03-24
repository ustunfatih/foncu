const {
  bootstrapSession,
  fetchInfo,
  fetchAllocation,
  formatDate,
} = require('./_lib/tefas');
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

const FUND_TYPES = [
  { kind: 'YAT', fon_tipi: 'mutual' },
  { kind: 'EMK', fon_tipi: 'pension' },
  { kind: 'BYF', fon_tipi: 'exchange' },
];

const ASSET_NAMES = {
  HS: 'Hisse Senedi',
  DT: 'Devlet Tahvili/Bonosu',
  KM: 'Kıymetli Maden',
  VM: 'Vadeli Mevduat / TL',
  R: 'Repo',
  KH: 'Katılım Hesabı',
  EU: 'Eurobond',
};

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

    // ── 1. Price history → returns + technical indicators ─────────────────
    // BindHistoryInfo with empty fonkod returns ALL funds for the period.
    // 3 × 90-day chunks cover ~270 calendar days (≈190 trading days).
    // This gives us: FONKODU, FONUNVAN, FIYAT, PORTFOYBUYUKLUK, KISISAYISI per row.
    log.push('Fetching price history for all funds via BindHistoryInfo (3 × 90-day chunks)...');

    const today = new Date();
    const chunks = [
      { daysBack: 270, daysEnd: 180 },
      { daysBack: 180, daysEnd: 90 },
      { daysBack: 90,  daysEnd: 0 },
    ].map(({ daysBack, daysEnd }) => {
      const s = new Date(today); s.setDate(s.getDate() - daysBack);
      const e = new Date(today); e.setDate(e.getDate() - daysEnd);
      return { start: formatDate(s), end: formatDate(e) };
    });

    const fundData = {}; // fon_kodu → { fon_tipi, unvan, entries: [{date, price, marketCap, investorCount}] }
    let totalRows = 0;
    let debugLogged = false;

    for (const { kind, fon_tipi } of FUND_TYPES) {
      for (const chunk of chunks) {
        const rows = await fetchInfo({ start: chunk.start, end: chunk.end, kind, cookie });
        if (rows.length === 0) continue;

        if (!debugLogged) {
          log.push(`  [DEBUG] BindHistoryInfo fields: ${Object.keys(rows[0]).join(', ')}`);
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
    }

    const fundCount = Object.keys(fundData).length;
    log.push(`Collected ${totalRows} price rows for ${fundCount} funds`);

    if (fundCount === 0) {
      throw new Error(
        'No fund data received from TEFAS BindHistoryInfo — response may not include FONKODU in bulk mode. Check [DEBUG] log for actual field names.'
      );
    }

    // Deduplicate + sort each fund's price series ascending by date
    for (const code of Object.keys(fundData)) {
      const seen = new Set();
      fundData[code].entries = fundData[code].entries
        .filter(e => { if (seen.has(e.date)) return false; seen.add(e.date); return true; })
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    const profileUpdates = Object.entries(fundData).map(([fon_kodu, { fon_tipi, unvan, entries }]) => {
      const prices = entries.map(e => e.price);
      const latest = entries[entries.length - 1];

      const sma20  = computeSma(prices, 20);
      const sma50  = computeSma(prices, 50);
      const sma200 = computeSma(prices, 200);
      const rsi14  = computeRsi14(prices);
      const sonFiyat = prices[prices.length - 1] ?? null;

      const smaCrossover = (() => {
        if (prices.length < 55) return false;
        const prevSma20 = computeSma(prices.slice(0, -5), 20);
        const prevSma50 = computeSma(prices.slice(0, -5), 50);
        if (!prevSma20 || !prevSma50 || !sma20 || !sma50) return false;
        return prevSma20 < prevSma50 && sma20 > sma50;
      })();

      const row = {
        fon_kodu,
        fon_tipi,
        son_fiyat: sonFiyat,
        rsi_14: rsi14,
        sma_20: sma20,
        sma_50: sma50,
        sma_200: sma200,
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
        guncelleme_zamani: new Date().toISOString(),
      };

      // Only include fields we have actual data for — avoids overwriting
      // existing risk_seviyesi / fon_kategorisi / yonetim_ucreti / stopaj
      if (unvan) row.unvan = unvan;
      if (latest.marketCap != null) row.fon_buyuklugu = latest.marketCap;
      if (latest.investorCount != null) row.yatirimci_sayisi = latest.investorCount;

      return row;
    });

    const { count: profileCount } = await upsertRows('fund_profiles', profileUpdates, 'fon_kodu');
    log.push(`Upserted ${profileCount} fund profiles with returns and technical indicators`);

    // ── 2. Asset allocation (today's snapshot) ────────────────────────────
    log.push('Fetching asset allocations...');
    const todayStr = formatDate(today);
    let allocCount = 0;

    for (const { kind } of FUND_TYPES) {
      const rows = await fetchAllocation({ start: todayStr, end: todayStr, kind, cookie });
      for (const row of rows) {
        const code = row.FONKODU || row.FONKOD;
        if (!code) continue;
        const dagilim = Object.entries(ASSET_NAMES)
          .filter(([k]) => row[k] != null && Number(row[k]) > 0)
          .map(([kod, ad]) => ({ kod, ad, agirlik: Number(row[kod]) }))
          .sort((a, b) => b.agirlik - a.agirlik);
        if (dagilim.length > 0) {
          await supabase.from('fund_profiles').update({ varlik_dagilimi: dagilim }).eq('fon_kodu', code);
          allocCount++;
        }
      }
    }
    log.push(`Updated asset allocations for ${allocCount} funds`);

    const elapsed = Date.now() - startTime;
    return res.status(200).json({ ok: true, elapsed, log });

  } catch (err) {
    console.error('[sync-fintables] Error:', err);
    return res.status(500).json({ ok: false, error: err.message, log });
  }
};
