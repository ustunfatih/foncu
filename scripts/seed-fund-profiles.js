#!/usr/bin/env node
/**
 * seed-fund-profiles.js
 *
 * One-time script to populate the Supabase `fund_profiles` table from Fintables.
 * Also computes returns + technical indicators from the existing `historical_data` table.
 *
 * Usage:
 *   node scripts/seed-fund-profiles.js
 *
 * Required env vars (in .env or shell):
 *   FINTABLES_MCP_TOKEN   - Bearer token from https://evo.fintables.com
 *   SUPABASE_URL          - Your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key (bypasses RLS)
 */

require('dotenv').config();
const { fintablesQuery } = require('../api/_lib/fintables');
const { computeRsi14, computeSma, rsiToSignal } = require('../api/_lib/sync-helpers');
const supabase = require('../api/_lib/supabase');

const BATCH_SIZE = 200;

// ── helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

async function upsert(table, rows, conflictCol) {
  if (!rows.length) return 0;
  const { error, count } = await supabase
    .from(table)
    .upsert(rows, { onConflict: conflictCol, count: 'exact' });
  if (error) throw new Error(`Supabase upsert to ${table} failed: ${error.message}`);
  return count ?? rows.length;
}

// ── step 1: fetch all fund profiles (paginated) ───────────────────────────────

async function fetchAllProfiles() {
  const all = [];
  let offset = 0;

  while (true) {
    log(`Fetching profiles offset=${offset}...`);
    const rows = await fintablesQuery(`
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
      LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `, `fetching fund profiles offset=${offset}`);

    all.push(...rows);
    log(`  Got ${rows.length} rows (total so far: ${all.length})`);

    if (rows.length < BATCH_SIZE) break; // last page
    offset += BATCH_SIZE;
  }

  return all;
}

// ── step 2: fetch & aggregate asset allocations ───────────────────────────────

async function fetchAllocations() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  log('Fetching asset allocations (last 3 days)...');
  let offset = 0;
  const all = [];

  while (true) {
    const rows = await fintablesQuery(`
      SELECT fon_kodu, tarih_europe_istanbul, varlik_sinifi_kodu, varlik_sinifi, yuzdesel_agirlik
      FROM gunluk_fon_varlik_sinifi_dagilimlari
      WHERE tarih_europe_istanbul >= '${cutoffStr}'
      ORDER BY fon_kodu, tarih_europe_istanbul DESC, yuzdesel_agirlik DESC
      LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `, `fetching allocations offset=${offset}`);

    all.push(...rows);
    if (rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  log(`  Fetched ${all.length} allocation rows`);

  // Group by fund, keep latest date only
  const byFund = {};
  for (const row of all) {
    const key = row.fon_kodu;
    if (!byFund[key]) byFund[key] = { tarih: row.tarih_europe_istanbul, items: [] };
    if (row.tarih_europe_istanbul === byFund[key].tarih) {
      byFund[key].items.push({
        kod: row.varlik_sinifi_kodu,
        ad: row.varlik_sinifi,
        agirlik: row.yuzdesel_agirlik,
      });
    }
  }

  return byFund;
}

// ── step 3: compute returns + technicals from Supabase historical_data ────────

async function computeTechnicals(fintablesCodes) {
  log('Reading NAV history from Supabase historical_data...');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 400);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data: navRows, error } = await supabase
    .from('historical_data')
    .select('fund_code, date, price')
    .gte('date', cutoffStr)
    .order('fund_code')
    .order('date', { ascending: true });

  if (error) throw error;
  log(`  Read ${navRows?.length ?? 0} NAV rows`);

  const pricesByFund = {};
  for (const row of navRows || []) {
    if (!pricesByFund[row.fund_code]) pricesByFund[row.fund_code] = [];
    if (row.price != null) pricesByFund[row.fund_code].push(Number(row.price));
  }

  const updates = [];
  for (const [fund_code, prices] of Object.entries(pricesByFund)) {
    if (!fintablesCodes.has(fund_code)) continue;

    const n = prices.length;
    const last = prices[n - 1] ?? null;

    const ret = (daysBack) => {
      const idx = n - 1 - daysBack;
      if (idx < 0 || prices[idx] == null || prices[idx] === 0) return null;
      return ((last - prices[idx]) / prices[idx]) * 100;
    };

    const sma20 = computeSma(prices, 20);
    const sma50 = computeSma(prices, 50);
    const sma200 = computeSma(prices, 200);
    const rsi14 = computeRsi14(prices);

    const smaCrossover = (() => {
      if (n < 55) return false;
      const prev20 = computeSma(prices.slice(0, -5), 20);
      const prev50 = computeSma(prices.slice(0, -5), 50);
      if (prev20 === null || prev50 === null || sma20 === null || sma50 === null) return false;
      return prev20 < prev50 && sma20 > sma50;
    })();

    updates.push({
      fon_kodu: fund_code,
      getiri_1g:  ret(1),
      getiri_1a:  ret(21),
      getiri_3a:  ret(63),
      getiri_6a:  ret(126),
      getiri_1y:  ret(252),
      son_fiyat:  last,
      rsi_14:     rsi14,
      sma_20:     sma20,
      sma_50:     sma50,
      sma_200:    sma200,
      ma200_ustu: sma200 !== null && last !== null ? last > sma200 : null,
      sma_kesisim_20_50: smaCrossover,
      rsi_sinyal: rsiToSignal(rsi14),
    });
  }

  return updates;
}

// ── step 4: seed fund holdings ────────────────────────────────────────────────

async function fetchAllHoldings(fintablesCodes) {
  log('Fetching fund holdings (latest monthly reports)...');
  const all = [];
  let offset = 0;

  while (true) {
    const rows = await fintablesQuery(`
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
      ORDER BY lr.fon_kodu, sa.yuzdesel_agirlik DESC
      LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `, `fetching holdings offset=${offset}`);

    all.push(...rows);
    log(`  Got ${rows.length} holding rows (total so far: ${all.length})`);

    if (rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return all
    .filter(r => fintablesCodes.has(r.fon_kodu))
    .map(r => ({
      fon_kodu: r.fon_kodu,
      hisse_kodu: r.hisse_kodu,
      yuzdesel_agirlik: r.yuzdesel_agirlik,
      fondaki_lot: r.fondaki_lot,
      asset_type: 'equity',
      rapor_ay: r.rapor_ay,
      rapor_yil: r.rapor_yil,
      guncelleme_zamani: new Date().toISOString(),
    }));
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.FINTABLES_MCP_TOKEN) {
    console.error('ERROR: FINTABLES_MCP_TOKEN is not set.\n');
    console.error('To get your token:');
    console.error('  1. Go to https://evo.fintables.com');
    console.error('  2. Sign in to your Fintables account');
    console.error('  3. Open Developer Settings → MCP Tokens → Create New Token');
    console.error('  4. Add FINTABLES_MCP_TOKEN=<your-token> to your .env file\n');
    process.exit(1);
  }
  if (!supabase) {
    console.error('ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.\n');
    process.exit(1);
  }

  const startMs = Date.now();

  // ── 1. Fund profiles ──
  const profileRows = await fetchAllProfiles();
  const now = new Date().toISOString();
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
    guncelleme_zamani: now,
  }));

  const profileCount = await upsert('fund_profiles', profiles, 'fon_kodu');
  log(`✓ Upserted ${profileCount} fund profiles`);

  const fintablesCodes = new Set(profiles.map(p => p.fon_kodu));

  // ── 2. Asset allocations ──
  const allocByFund = await fetchAllocations();
  let allocCount = 0;
  for (const [fon_kodu, { items }] of Object.entries(allocByFund)) {
    if (!fintablesCodes.has(fon_kodu)) continue;
    const { error } = await supabase
      .from('fund_profiles')
      .update({ varlik_dagilimi: items })
      .eq('fon_kodu', fon_kodu);
    if (error) log(`  WARN: alloc update failed for ${fon_kodu}: ${error.message}`);
    else allocCount++;
  }
  log(`✓ Updated asset allocations for ${allocCount} funds`);

  // ── 3. Returns + technicals ──
  const technicalUpdates = await computeTechnicals(fintablesCodes);
  if (technicalUpdates.length > 0) {
    const techCount = await upsert('fund_profiles', technicalUpdates, 'fon_kodu');
    log(`✓ Updated returns + technicals for ${techCount} funds`);
  } else {
    log('  No historical_data rows found — skipping technicals');
  }

  // ── 4. Fund holdings ──
  const holdings = await fetchAllHoldings(fintablesCodes);
  const holdingCount = await upsert('fund_holdings', holdings, 'fon_kodu,hisse_kodu,rapor_yil,rapor_ay');
  log(`✓ Upserted ${holdingCount} fund holdings`);

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  log(`\nDone in ${elapsed}s 🎉`);
  log(`  Profiles: ${profiles.length}`);
  log(`  Allocations: ${allocCount}`);
  log(`  Technicals: ${technicalUpdates.length}`);
  log(`  Holdings: ${holdings.length}`);
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
