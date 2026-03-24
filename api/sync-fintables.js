const {
  bootstrapSession,
  fetchFundReturns,
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

// TEFAS asset class codes → display names
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
    // ── Bootstrap TEFAS session ────────────────────────────────────────────
    log.push('Bootstrapping TEFAS session...');
    const cookie = await bootstrapSession();

    // ── 1. Fund profiles + pre-computed return metrics ─────────────────────
    log.push('Fetching fund profiles and returns from TEFAS BindFundReturn...');
    const allProfiles = [];

    for (const { kind, fon_tipi } of FUND_TYPES) {
      const rows = await fetchFundReturns({ kind, cookie });
      if (rows.length === 0) {
        log.push(`  [WARN] No data returned for kind=${kind}`);
        continue;
      }
      // Log first row keys once to aid debugging if field names change
      if (allProfiles.length === 0) {
        log.push(`  [DEBUG] BindFundReturn fields: ${Object.keys(rows[0]).join(', ')}`);
      }
      for (const r of rows) {
        const code = r.FONKODU || r.FONKOD;
        if (!code) continue;
        allProfiles.push({
          fon_kodu: code,
          unvan: r.FONUNVAN || null,
          fon_tipi,
          fon_kategorisi: r.FONKATEGORI || r.TPFONTIPI || null,
          risk_seviyesi: r.RISKDEGERI ?? null,
          fon_buyuklugu: r.FONBUYUKLUGU ?? 0,
          yatirimci_sayisi: r.YATIRIMCISAYISI ?? 0,
          getiri_1g:  r.GUNLUKGETIRI  ?? null,
          getiri_1h:  r.HAFTALIKGETIRI ?? null,
          getiri_1a:  r.AYLIKGETIRI   ?? null,
          getiri_3a:  r.UCAYLIKGETIRI ?? null,
          getiri_6a:  r.ALTIAYLIKGETIRI ?? null,
          getiri_ytd: r.YTDGETIRI     ?? null,
          getiri_1y:  r.YILLIKGETIRI  ?? null,
          guncelleme_zamani: new Date().toISOString(),
        });
      }
    }

    const { count: profileCount } = await upsertRows('fund_profiles', allProfiles, 'fon_kodu');
    log.push(`Upserted ${profileCount} fund profiles with return metrics`);

    // ── 2. Price history → RSI + SMA technical indicators ─────────────────
    // Fetch 270 calendar days (~190 trading days) in 3 × 90-day chunks.
    // Uses fonkod='' (empty) to request ALL funds at once per type.
    // If TEFAS returns per-fund field FONKODU in each row this works as bulk;
    // otherwise rows will be skipped and RSI/SMA remain unchanged.
    log.push('Fetching price history for technical indicators (3 × 90-day chunks)...');
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

    const pricesByFund = {};
    let priceRowsTotal = 0;

    for (const { kind } of FUND_TYPES) {
      for (const chunk of chunks) {
        const rows = await fetchInfo({ start: chunk.start, end: chunk.end, kind, cookie });
        for (const row of rows) {
          const code = row.FONKODU || row.FONKOD;
          if (!code || row.FIYAT == null) continue;
          if (!pricesByFund[code]) pricesByFund[code] = [];
          pricesByFund[code].push({
            date: new Date(Number(row.TARIH)).toISOString().slice(0, 10),
            price: Number(row.FIYAT),
          });
          priceRowsTotal++;
        }
      }
    }

    const fundsWithPrices = Object.keys(pricesByFund).length;
    log.push(`Collected ${priceRowsTotal} price rows for ${fundsWithPrices} funds`);

    if (fundsWithPrices > 0) {
      // Deduplicate and sort each fund's price series by date ascending
      for (const code of Object.keys(pricesByFund)) {
        const seen = new Set();
        pricesByFund[code] = pricesByFund[code]
          .filter(e => { if (seen.has(e.date)) return false; seen.add(e.date); return true; })
          .sort((a, b) => a.date.localeCompare(b.date));
      }

      const indicatorUpdates = Object.entries(pricesByFund).map(([fon_kodu, entries]) => {
        const prices = entries.map(e => e.price);
        const sma20  = computeSma(prices, 20);
        const sma50  = computeSma(prices, 50);
        const sma200 = computeSma(prices, 200);
        const rsi14  = computeRsi14(prices);
        const sonFiyat = prices[prices.length - 1] ?? null;

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
        };
      });

      if (indicatorUpdates.length > 0) {
        await upsertRows('fund_profiles', indicatorUpdates, 'fon_kodu');
      }
      log.push(`Updated technical indicators for ${indicatorUpdates.length} funds`);
    } else {
      log.push('[WARN] No price history rows received — RSI/SMA not updated');
    }

    // ── 3. Asset allocation (today's snapshot) ────────────────────────────
    log.push('Fetching asset allocations from TEFAS BindHistoryAllocation...');
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
