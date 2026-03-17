# foncu — Major Overhaul Design Spec

**Date:** 2026-03-17
**Status:** Approved by user
**Author:** Collaborative brainstorming session (Claude Code + Fatih Ustun)

---

## 1. Overview

foncu is a Turkish investment fund analysis platform. This overhaul replaces the TEFAS API data layer with Fintables EVO MCP, fixes three broken tabs, adds three new features embedded in existing tabs, and introduces one new tab for fund overlap analysis.

The core principle: **keep what works, fix what's broken, add what matters.**

---

## 2. Current State

### Tech Stack
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Recharts
- **Backend:** Vercel serverless functions (Node.js)
- **Database:** Supabase (PostgreSQL) — auth + portfolio persistence + fund data cache
- **Data Sources:** TEFAS API (fund NAV prices and history), TradingEconomics (economic calendar, broken), exchangerate.host / frankfurter.app (FX rates, working)
- **Auth:** GitHub OAuth via Supabase

### Existing Tabs (8)
1. **Ana Sayfa** — fund performance comparison charts, risk metrics
2. **Fon Tarayıcı** — return-based fund screener (**broken**)
3. **Portföy** — portfolio P&L, allocation, cost basis
4. **Benchmark** — index comparison
5. **Makro** — USD/TRY, EUR/TRY exchange rate charts
6. **Teknik Tarama** — RSI oversold + SMA crossover scanner (**broken**)
7. **Takvim** — economic calendar (**broken** — falls back to static JSON)
8. **Dışa Aktar** — PDF/Excel export

### What's Broken and Why
- **Fon Tarayıcı:** Bulk TEFAS history fetching fails under load
- **Teknik Tarama:** RSI/SMA calculation depends on TEFAS bulk price pulls that time out
- **Takvim:** TradingEconomics API key missing in production; static JSON fallback is stale and irrelevant to BIST investors

---

## 3. Architecture Decision

### Data Layer Strategy

```
TEFAS API          → Fund NAV prices & historical NAV only (kept, already well-cached)
Fintables EVO MCP  → Fund holdings, profiles, KAP events, OHLCV for technicals (new)
Supabase           → Auth + portfolio persistence + Fintables sync cache (kept + extended)
```

**Key decision:** Fintables EVO is accessible only via MCP HTTP transport at `https://evo.fintables.com/mcp`, authenticated with the owner's Pro account OAuth token stored as a Vercel environment secret (`FINTABLES_MCP_TOKEN`). It is NOT a public REST API.

Therefore a **nightly sync pattern** is used: a Vercel Cron function (`api/sync-fintables.js`) calls the Fintables MCP as an HTTP MCP client using `@modelcontextprotocol/sdk`, fetches fund holdings and event data, and writes it to new Supabase tables. The web app reads exclusively from Supabase at runtime — zero Fintables latency on user requests.

**CSP note:** The Fintables MCP call in `api/sync-fintables.js` is a server-to-server call (Vercel function → external API). It is not subject to the browser Content-Security-Policy headers defined in `vercel.json`. No CSP changes needed.

**Makro tab FX data:** Decision is to **keep** the existing `exchangerate.host → frankfurter.app` fallback chain. This tab is currently working. Migrating a working tab to Fintables FX data is unnecessary risk with no user-facing benefit.

### Fintables MCP Integration

The sync function calls the MCP's `veri_sorgula` tool, which accepts SQL queries against the Fintables database. **It does NOT call individual table-named tools** — the single entry point is `veri_sorgula`. All Fintables data access in the sync goes through SQL queries via this tool.

**Verified Fintables table names and key columns used in sync:**

| Fintables Table | Key Columns Used | Purpose |
|---|---|---|
| `fonlar` | `fon_kodu`, `unvan`, `fon_tipi`, `portfoy_yonetim_sirketi_kodu`, `risk_seviyesi`, `stopaj`, `yonetim_ucreti`, `alis_valoru`, `satis_valoru`, `semsiye_fon`, `tefasa_acik`, `pazar_payi` | Fund metadata |
| `portfoy_yonetim_sirketleri` | `portfoy_yonetim_sirketi_kodu`, `unvan` | Portfolio management company names |
| `fon_kategorileri` | `fon_kategori_id`, `baslik`, `fon_tipi` | Fund category names |
| `fon_kategori_iliskileri` | `fon_kodu`, `fon_kategori_id` | Fund ↔ category join |
| `gunluk_fon_degerleri` | `tarih_europe_istanbul`, `fon_kodu`, `fon_buyuklugu`, `yatirimci_sayisi` | AUM, investor count (latest record per fund) |
| `fon_portfoy_dagilim_raporlari` | `fon_portfoy_dagilim_raporu_id`, `fon_kodu`, `ay`, `yil`, `kap_bildirim_id` | Monthly report metadata |
| `fon_portfoy_dagilim_raporu_sembol_agirliklari` | `fon_portfoy_dagilim_raporu_id`, `fon_kodu`, `yuzdesel_agirlik`, `fondaki_lot` | Stock-level holdings per fund per report |
| `gunluk_fon_varlik_sinifi_dagilimlari` | `tarih_europe_istanbul`, `fon_kodu`, `varlik_sinifi_kodu`, `varlik_sinifi`, `yuzdesel_agirlik` | Asset class distribution (latest per fund) |

**Equity identification:** A holding in `fon_portfoy_dagilim_raporu_sembol_agirliklari` is an equity holding if its `fon_kodu` (the holding ticker, confusingly named the same column) matches a known BIST ticker — i.e., it exists in the `hisse_senetleri` table. The sync validates this by joining against `hisse_senetleri.hisse_senedi_kodu`. Only confirmed BIST equities are written to `fund_holdings.asset_type = 'equity'`.

### New Supabase Tables — Full DDL

```sql
-- Fund stock-level holdings (from monthly TEFAS portfolio reports)
CREATE TABLE fund_holdings (
  id                bigserial PRIMARY KEY,
  fon_kodu          text NOT NULL,              -- the fund code (e.g. 'AKB')
  hisse_kodu        text NOT NULL,              -- BIST equity ticker (e.g. 'THYAO')
  yuzdesel_agirlik  double precision,           -- % weight in fund portfolio
  fondaki_lot       double precision,           -- nominal lot count
  asset_type        text NOT NULL DEFAULT 'equity', -- always 'equity' (non-equities excluded)
  rapor_ay          integer NOT NULL,           -- report month (1-12)
  rapor_yil         integer NOT NULL,           -- report year
  guncelleme_zamani timestamptz DEFAULT now(),
  UNIQUE (fon_kodu, hisse_kodu, rapor_yil, rapor_ay)
);

-- Enable public read (data is public market information)
ALTER TABLE fund_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fund_holdings_public_read" ON fund_holdings FOR SELECT USING (true);
CREATE INDEX fund_holdings_fon_kodu_idx ON fund_holdings (fon_kodu);
CREATE INDEX fund_holdings_hisse_kodu_idx ON fund_holdings (hisse_kodu);
CREATE INDEX fund_holdings_rapor_idx ON fund_holdings (rapor_yil DESC, rapor_ay DESC);

-- Fund profiles + pre-computed metrics (replaces and extends existing 'funds' table)
-- The existing 'funds' table is KEPT for backward compat; fund_profiles is the new canonical source.
-- Phase 2 migrates api/funds.js to read from fund_profiles; join key is fon_kodu = funds.code.
CREATE TABLE fund_profiles (
  fon_kodu                    text PRIMARY KEY,
  unvan                       text NOT NULL,
  fon_tipi                    text,             -- 'mutual' | 'pension' | 'exchange' | 'realestate'
  portfoy_yonetim_sirketi     text,             -- PYŞ full name
  risk_seviyesi               integer,          -- 1-7
  stopaj                      double precision, -- withholding tax %
  yonetim_ucreti              double precision, -- annual management fee %
  alis_valoru                 integer,          -- purchase settlement days (T+N)
  satis_valoru                integer,          -- redemption settlement days (T+N)
  fon_kategorisi              text,             -- Fintables category name
  semsiye_fon                 text,
  tefasa_acik                 boolean,
  pazar_payi                  double precision,
  -- Metrics computed during nightly sync from Fintables OHLCV data
  fon_buyuklugu               numeric,          -- latest AUM (TRY)
  yatirimci_sayisi            integer,          -- latest investor count
  getiri_1g                   double precision, -- 1-day return %
  getiri_1h                   double precision, -- 1-week return %
  getiri_1a                   double precision, -- 1-month return %
  getiri_3a                   double precision, -- 3-month return %
  getiri_6a                   double precision, -- 6-month return %
  getiri_ytd                  double precision, -- year-to-date return %
  getiri_1y                   double precision, -- 1-year return %
  -- Technical indicators (computed from Fintables OHLCV, NOT from TEFAS price history)
  rsi_14                      double precision, -- RSI with 14-day period
  sma_20                      double precision, -- 20-day simple moving average (fund NAV)
  sma_50                      double precision, -- 50-day simple moving average
  sma_200                     double precision, -- 200-day simple moving average
  son_fiyat                   double precision, -- latest NAV
  ma200_ustu                  boolean,          -- true if son_fiyat > sma_200
  sma_kesisim_20_50           boolean,          -- true if sma_20 crossed above sma_50 in last 5 days
  rsi_sinyal                  text,             -- 'guclu_al' (<25) | 'al' (25-35) | 'dikkat' (35-45) | 'normal' (>45)
  -- Asset allocation (latest, from gunluk_fon_varlik_sinifi_dagilimlari)
  varlik_dagilimi             jsonb,            -- e.g. [{"kod":"HS","ad":"Hisse Senedi","agirlik":78.2}, ...]
  guncelleme_zamani           timestamptz DEFAULT now()
);

ALTER TABLE fund_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fund_profiles_public_read" ON fund_profiles FOR SELECT USING (true);

-- KAP events calendar (replaces TradingEconomics)
CREATE TABLE kap_events (
  id                bigserial PRIMARY KEY,
  olay_tarihi       date NOT NULL,
  olay_tipi         text NOT NULL,   -- 'temettu' | 'bilanco' | 'genel_kurul' | 'kap_bildirimi' | 'fon_raporu'
  hisse_kodu        text,            -- BIST ticker (nullable — events may be fund-only)
  fon_kodu          text,            -- fund code (nullable — events may be stock-only)
  baslik            text NOT NULL,
  aciklama          text,
  deger             text,            -- human-readable value e.g. "₺4.20 brüt temettü"
  kap_bildirim_id   bigint,          -- KAP disclosure ID for deep linking
  guncelleme_zamani timestamptz DEFAULT now()
);

ALTER TABLE kap_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kap_events_public_read" ON kap_events FOR SELECT USING (true);
CREATE INDEX kap_events_tarih_idx ON kap_events (olay_tarihi);
CREATE INDEX kap_events_tipi_idx ON kap_events (olay_tipi);
```

### Vercel Cron Configuration

Turkey is UTC+3 (fixed, no DST). 02:00 TR = 23:00 UTC previous day.

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/sync-fintables",
      "schedule": "0 23 * * *"
    }
  ]
}
```

**Timeout concern:** The sync must complete within Vercel's function timeout. On Hobby plan this is 10s (too short). The project must be on **Pro plan** (60s) or **Enterprise** (300s). If a single sync run exceeds the timeout, the sync function should be split into sub-syncs by data type, each triggered sequentially via internal HTTP calls from a lightweight orchestrator cron. For now, the spec assumes Pro plan (60s) and a single sync run. If this proves insufficient, the split-sync pattern is the fallback.

**Manual trigger:** A `GET /api/sync-fintables?secret=CRON_SECRET` endpoint allows manual triggering during development and testing (the existing `CRON_SECRET` env var is reused for this).

### Backend Changes Summary
- **Keep:** All existing Vercel functions, Supabase client setup, TEFAS NAV price caching
- **Add:** `api/sync-fintables.js`, `api/overlap.js`, `api/fund-profile.js`, `api/holdings-screener.js`, `api/portfolio-exposure.js`
- **Modify:** `api/fund-screen.js`, `api/fund-technical-scan.js`, `api/market-events.js`
- **Keep unchanged:** `api/macro-series.js` (FX data stays on exchangerate.host / frankfurter.app)
- **Remove:** TradingEconomics integration from `api/market-events.js`

---

## 4. Feature Specification

### 4.1 New Tab: Örtüşme (Fund Overlap Analysis)

**Purpose:** Show stock-level overlap between up to 5 selected funds based on monthly TEFAS portfolio disclosure reports.

**Data source:** `fund_holdings` Supabase table (latest rapor_yil/rapor_ay per fund)

**Fund selector constraint:** Any fund type can be added to the selector. However, if a fund has <30% equity allocation (per `varlik_dagilimi` in `fund_profiles`), a warning badge is shown on its tag: "Düşük hisse oranı — örtüşme kısmi". Non-equity assets are excluded from the overlap calculation silently; only rows in `fund_holdings` (all of which have `asset_type = 'equity'`) are used.

**Layout:**
1. **Fund selector** — up to 5 fund tags with remove buttons; report date shown as "Rapor: [Ay] [Yıl]" (taken from the most recent rapor_yil/rapor_ay in fund_holdings for the selected funds)
2. **Overlap Matrix** — NxN color-coded table:
   - Green background `#e8f5e9` (>50%): high overlap = redundant funds
   - Orange/amber background `#fff8e1` (30–50%): moderate overlap
   - Red background `#fff0f0` (<30%): low overlap = well-diversified
   - Each cell shows: percentage (bold, color-coded) + shared stock count (small muted text)
   - Diagonal cells show "—"
   - Matrix is symmetric; both triangles are shown for readability
3. **Shared Holdings Table** — filter chips: "Tümü / 2+ Fon / 3+ Fon / 4+ Fon":
   - Columns: Ticker · Şirket · [Fund 1 %] · [Fund 2 %] · ... · Fon Count badge
   - Sorted by fund count desc, then sum of weights desc
   - Missing positions shown as "—" in muted gray
   - "Show N more" at bottom

**Overlap calculation — Weighted Jaccard Similarity:**
```
overlap(A, B) = Σᵢ∈U min(wA_i, wB_i) / Σᵢ∈U max(wA_i, wB_i)
```
where:
- `U` = **union** of all equity holdings in fund A and fund B
- `wA_i` = weight of stock `i` in fund A (0 if not held)
- `wB_i` = weight of stock `i` in fund B (0 if not held)
- All weights are taken from the same rapor_yil/rapor_ay (most recent available)

**API endpoint:** `GET /api/overlap?funds=AKB,GAF,TI2,YAS`

**Request:** Comma-separated fund codes (2–5 funds)

**Response schema:**
```jsonc
{
  "rapor": { "yil": 2026, "ay": 1 },          // most recent report period used
  "matrix": {
    "AKB": {
      "GAF": { "pct": 0.62, "sharedCount": 12 },
      "TI2": { "pct": 0.41, "sharedCount": 8 },
      "YAS": { "pct": 0.18, "sharedCount": 3 }
    },
    "GAF": {
      "AKB": { "pct": 0.62, "sharedCount": 12 },
      "TI2": { "pct": 0.55, "sharedCount": 10 },
      "YAS": { "pct": 0.22, "sharedCount": 4 }
    }
    // ... symmetric for all pairs
  },
  "sharedHoldings": [
    {
      "ticker": "THYAO",
      "sirketAdi": "Türk Hava Yolları A.O.",
      "weights": { "AKB": 0.082, "GAF": 0.071, "TI2": 0.054, "YAS": null },
      "fundCount": 3
    }
    // sorted by fundCount desc, then sum(weights) desc
  ]
}
```

**URL state:** Fund selections are reflected in the URL as query params: `?tab=ortusme&funds=AKB,GAF,TI2`. The existing single-page `useState` routing in `App.tsx` is extended to sync with `window.history.pushState` for this tab only (the only tab with shareable state).

**Cross-tab integration:**
- Fund Profile Drawer → "Örtüşme'ye Gönder" → navigates to Örtüşme tab + pre-selects that fund
- Holdings Screener → "+ Ekle" popover → "Örtüşme'ye ekle" → same
- Fund color assignment: colors are assigned by index of fund in the selection array (0=lavender, 1=sky blue, 2=mint, 3=amber, 4=pink), consistent across all tabs within the same session

---

### 4.2 New Feature: Fund Profile Drawer (Ana Sayfa)

**Purpose:** Rich fund detail panel sliding in from the right when any fund chip is clicked.

**Trigger:** Click on any fund tag in the fund selector on Ana Sayfa

**Data source:** `fund_profiles` (metadata + metrics + asset allocation) + `fund_holdings` (top holdings)

**API:** `GET /api/fund-profile?code=AKB`

**Response schema:**
```jsonc
{
  "fon_kodu": "AKB",
  "unvan": "Ak Portföy Birinci Hisse Senedi Fonu",
  "fon_tipi": "mutual",
  "portfoy_yonetim_sirketi": "Ak Portföy Yönetimi A.Ş.",
  "risk_seviyesi": 5,
  "stopaj": 0,
  "yonetim_ucreti": 1.95,
  "alis_valoru": 1,
  "satis_valoru": 2,
  "fon_kategorisi": "Hisse Senedi",
  "tefasa_acik": true,
  "metriks": {
    "getiri_1y": 38.4,
    "getiri_1a": -8.2,
    "fon_buyuklugu": 2100000,
    "yatirimci_sayisi": 4821,
    "sharpe": 1.42,           // computed from TEFAS NAV history (existing analytics.ts logic)
    "max_drawdown": -18.2,    // same
    "volatilite": 0.24        // same
  },
  "varlik_dagilimi": [
    { "kod": "HS", "ad": "Hisse Senedi", "agirlik": 78.0 },
    { "kod": "REPO", "ad": "Repo", "agirlik": 10.0 },
    { "kod": "DT", "ad": "Devlet Tahvili", "agirlik": 7.0 },
    { "kod": "DIGER", "ad": "Diğer", "agirlik": 5.0 }
  ],
  "topHoldings": [
    { "ticker": "THYAO", "agirlik": 8.2 },
    { "ticker": "AKBNK", "agirlik": 7.1 },
    { "ticker": "GARAN", "agirlik": 6.8 },
    { "ticker": "BIMAS", "agirlik": 4.5 },
    { "ticker": "EREGL", "agirlik": 3.8 }
  ],
  "rapor": { "yil": 2026, "ay": 1 }
}
```

**Note on Sharpe/Drawdown/Volatility:** These are NOT stored in `fund_profiles`. They are computed on-demand from the existing TEFAS NAV history in Supabase using the existing `analytics.ts` functions. The `fund-profile` endpoint fetches the last 252 trading days of NAV from the existing `historical_data` Supabase table and computes them server-side.

---

### 4.3 New Feature: Holdings-Based Screener (Fon Tarayıcı — Hisse Filtresi mode)

**Purpose:** Find all funds that hold a specific BIST stock above a minimum weight threshold.

**UI:** Toggle between existing "Getiri Filtresi" mode and new "Hisse Filtresi" mode

**Inputs:** Ticker text input · Min weight filter · Fund type selector

**Data source:** `fund_holdings` JOIN `fund_profiles` Supabase tables (join key: `fon_kodu`)

**API:** `GET /api/holdings-screener?ticker=THYAO&minWeight=3&fundType=mutual`

**Response schema:**
```jsonc
{
  "ticker": "THYAO",
  "sirketAdi": "Türk Hava Yolları A.O.",
  "rapor": { "yil": 2026, "ay": 1 },
  "fonlar": [
    {
      "fon_kodu": "AKB",
      "unvan": "Ak Portföy Birinci Hisse Senedi Fonu",
      "portfoy_yonetim_sirketi": "Ak Portföy Yönetimi A.Ş.",
      "agirlik": 8.2,
      "getiri_1y": 38.4,
      "risk_seviyesi": 5
    }
    // sorted by agirlik desc
  ]
}
```

---

### 4.4 New Feature: Effective Stock Exposure (Portföy)

**Purpose:** Show the user's true underlying stock exposure across all funds in their portfolio, weighted by current market value.

**Calculation:**
```
fundAllocation_i  = currentValue_i / Σ currentValue_j   (market value weight, not cost basis)
effectiveWeight(stock) = Σᵢ fundAllocation_i × stockWeightInFund_i
effectiveTRY(stock) = effectiveWeight(stock) × totalPortfolioValue
```

`currentValue_i` = fund unit NAV × shares held. The existing `/api/portfolio-valuation` endpoint already returns current values; the new endpoint reuses this data.

**API:** `POST /api/portfolio-exposure`

**Request body:**
```jsonc
{
  "holdings": [
    { "fundCode": "AKB", "shares": 1250.5, "currentValue": 128400 },
    { "fundCode": "GAF", "shares": 890.2, "currentValue": 99200 },
    { "fundCode": "TI2", "shares": 440.0, "currentValue": 56900 }
  ]
}
```

**Response schema:**
```jsonc
{
  "totalValue": 284500,
  "rapor": { "yil": 2026, "ay": 1 },
  "exposure": [
    {
      "ticker": "THYAO",
      "sirketAdi": "Türk Hava Yolları A.O.",
      "effectiveWeight": 7.4,
      "effectiveTRY": 21053,
      "byFund": {
        "AKB": { "fundWeight": 8.2, "contribution": 3.69 },
        "GAF": { "fundWeight": 7.1, "contribution": 2.49 },
        "TI2": { "fundWeight": 5.4, "contribution": 1.20 }
      }
    }
    // sorted by effectiveWeight desc
  ]
}
```

---

### 4.5 Fixed Tab: Fon Tarayıcı (Getiri Filtresi mode)

**Problem:** Bulk TEFAS history fetch fails under load.

**Fix:** Return metrics (`getiri_1y`, `getiri_1a`, etc.) are pre-computed during nightly sync and stored in `fund_profiles`. The screener endpoint reads directly from `fund_profiles` with WHERE filters — no bulk history fetch at request time.

**Modified endpoint:** `api/fund-screen.js` — replaces TEFAS bulk fetch with `SELECT * FROM fund_profiles WHERE getiri_1y >= $minReturn1y AND getiri_1a >= $minReturn1a ORDER BY getiri_1y DESC`

---

### 4.6 Fixed Tab: Teknik Tarama

**Problem:** RSI/SMA calculation depends on unreliable bulk TEFAS pulls.

**Fix:** RSI(14), SMA(20), SMA(50), SMA(200) are computed during nightly sync using **Fintables OHLCV data** (not TEFAS). Results are stored as columns in `fund_profiles`. The scan endpoint reads pre-computed values — zero runtime computation.

**OHLCV source clarification:** Fintables is the authoritative source for technical indicator computation. TEFAS NAV history in Supabase remains the source for Sharpe/drawdown/volatility (as these are already computed on-demand from the `historical_data` table). The two sources may have minor NAV divergences; this is acceptable.

**MA200 Üstü scan definition:** `ma200_ustu = true` → current fund NAV (`son_fiyat`) is above the 200-day SMA (`sma_200`). Requires minimum 200 trading days of OHLCV history. Funds with insufficient history are excluded from this scan mode.

**Signal definitions:**
- `guclu_al`: RSI(14) < 25
- `al`: 25 ≤ RSI(14) < 35
- `dikkat`: 35 ≤ RSI(14) < 45
- `normal`: RSI(14) ≥ 45

**SMA Kesişim definition:** `sma_kesisim_20_50 = true` → SMA(20) has crossed above SMA(50) within the last 5 trading days (bullish crossover).

**Modified endpoint:** `api/fund-technical-scan.js` — replaces runtime RSI/SMA computation with `SELECT * FROM fund_profiles WHERE rsi_14 <= $threshold ORDER BY rsi_14 ASC`

---

### 4.7 Fixed Tab: Takvim

**Problem:** TradingEconomics API key missing; static fallback irrelevant.

**Fix:** Replaced with `kap_events` Supabase table populated during nightly sync.

**Event types in `kap_events.olay_tipi`:**
- `temettu` — dividend ex-dates (from `hisse_senedi_temettuler` via Fintables)
- `bilanco` — quarterly earnings release dates (from `hisse_finansal_tablolari.yayinlanma_tarihi_utc`)
- `genel_kurul` — general assembly dates (from KAP announcements)
- `kap_bildirimi` — significant KAP special situation disclosures
- `fon_raporu` — monthly fund portfolio report publication dates (auto-detected: when a new record appears in `fon_portfoy_dagilim_raporlari`, a `fon_raporu` event is added and the sync re-fetches `fund_holdings` for that fund)

**Modified endpoint:** `api/market-events.js` — replaces TradingEconomics call with `SELECT * FROM kap_events WHERE olay_tarihi BETWEEN $start AND $end ORDER BY olay_tarihi ASC`

---

## 5. UI Design Direction

### Theme
- **Background:** `#f5f4f0` (warm off-white)
- **Card background:** `#ffffff` with `1px solid #e8e6e1` border, `10px` border-radius
- **Number colors:** Green `#2e7d32` (positive/high overlap), Orange `#e65100` (neutral/mid), Red `#c62828` (negative/low overlap)
- **Fund tag colors (by index in selection, consistent within session):**
  - Index 0: lavender `#ede9fe` / `#5b21b6`
  - Index 1: sky blue `#dbeafe` / `#1e40af`
  - Index 2: mint `#d1fae5` / `#065f46`
  - Index 3: amber `#fef3c7` / `#92400e`
  - Index 4: pink `#fce7f3` / `#9d174d`
- **Accent:** `#5b21b6` purple for new features, CTAs, active states

### Consistency Rules
- All tabs share the same card, table, badge, and tag React components (extracted to `src/components/ui/`)
- Section titles: `9px uppercase #aaa` with `0.05em` letter-spacing
- Tables: alternating row background `#fafaf8`
- "Show N more" pagination on all long lists

---

## 6. Implementation Roadmap

### Phase 1 — Data Infrastructure *(blocker for all subsequent phases)*
1. Write and run Supabase migration with the 3 new tables (`fund_holdings`, `fund_profiles`, `kap_events`) including indexes and RLS policies
2. Write `api/sync-fintables.js` — Vercel Cron nightly at 23:00 UTC, calls Fintables MCP via `@modelcontextprotocol/sdk`, upserts to all 3 tables
3. Add `FINTABLES_MCP_TOKEN` to Vercel environment secrets
4. Add cron entry to `vercel.json`
5. Test sync with manual trigger: `GET /api/sync-fintables?secret=CRON_SECRET`
6. Verify data in Supabase (row counts, sample values, equity identification accuracy)

### Phase 2 — Data Source Migration *(low risk; can overlap with Phase 3)*
1. `api/fund-history.js` → reads Fintables OHLCV from Supabase (synced nightly), replaces TEFAS chunked fetch for fund performance data
2. `api/funds.js` → reads from `fund_profiles` instead of TEFAS fon list; keeps `funds` table for backward compat
3. `api/macro-series.js` → **no change** (keep existing FX chain)

### Phase 3 — Fix Broken Tabs *(depends on Phase 2)*
1. `api/fund-screen.js` → read pre-computed returns from `fund_profiles`
2. `api/fund-technical-scan.js` → read pre-computed RSI/SMA from `fund_profiles`
3. `api/market-events.js` → read from `kap_events`
4. Update frontend components for Fon Tarayıcı, Teknik Tarama, Takvim to match new data shapes

### Phase 4 — New Embedded Features *(depends on Phase 1)*
1. Add `api/fund-profile.js` endpoint
2. Build Fund Profile Drawer component (`src/components/FundProfileDrawer.tsx`)
3. Wire drawer to fund chip clicks on Ana Sayfa
4. Add `api/holdings-screener.js` endpoint
5. Add Hisse Filtresi toggle + UI to Fon Tarayıcı
6. Add `api/portfolio-exposure.js` endpoint
7. Add Efektif Hisse Maruziyeti section to Portföy tab

### Phase 5 — New Örtüşme Tab *(depends on Phases 1 + 4)*
1. Add `api/overlap.js` endpoint (Weighted Jaccard calculation over `fund_holdings`)
2. Build `OverlapMatrix` React component
3. Build `SharedHoldingsTable` React component
4. Build `OrtusmeTab` page + fund selector
5. Implement cross-tab deep linking + URL state (`window.history.pushState`)
6. Wire "Örtüşme'ye Gönder" from Fund Profile Drawer
7. Wire "+ Ekle → Örtüşme" from Holdings Screener

### Phase 6 — UI Modernization & Deployment
1. Extract shared UI components to `src/components/ui/` (Card, Table, Badge, TagPill, SectionTitle)
2. Apply consistent light theme (`#f5f4f0` bg, pastel tags, red/orange/green numbers) across all tabs
3. TypeScript cleanup: remove `any` types, delete dead TEFAS helper code
4. Update Dışa Aktar tab to export data from `fund_profiles` and `fund_holdings` tables
5. Update Vercel cache headers for new endpoints
6. Run `npx tsc --noEmit` — must pass with zero errors
7. Deploy to Vercel; verify nightly sync runs in production

### Dependency Chain
```
Phase 1 ──▶ Phase 2 ──▶ Phase 3
         └──▶ Phase 4 ──▶ Phase 5 ──▶ Phase 6
```
Phases 2 and 3 can overlap. Phase 6 steps 1-2 (UI extraction) can begin any time after Phase 3.

---

## 7. Key Constraints & Decisions

| Decision | Choice | Reason |
|---|---|---|
| Fintables access method | Nightly sync via MCP HTTP client | No public REST API; monthly holdings data makes nightly sync sufficient |
| TEFAS replacement scope | Partial — NAV price history stays on TEFAS | TEFAS NAV caching is solid; Fintables used for fund metadata and holdings |
| Supabase | Kept + extended with 3 new tables | Cannot be replaced; portfolio data is user-specific |
| Makro FX data | Keep existing exchangerate.host / frankfurter.app | Working tab; no benefit to migrating |
| Overlap calculation | Weighted Jaccard over union of equity holdings | Accounts for both which stocks are shared AND their weights |
| Overlap formula domain | Union of all stocks in both funds (not just intersection) | Intersection-only would inflate the score |
| RSI/SMA data source | Fintables OHLCV (not TEFAS) | TEFAS bulk pulls are the root cause of the broken Teknik Tarama |
| Technical indicators | Pre-computed at sync time, stored in `fund_profiles` | Avoids all runtime computation; fixes the timeout failures |
| Non-equity funds in overlap | Allowed in selector, warning shown, non-equity excluded silently | Graceful degradation; don't block the user |
| Fund tag colors | Index-based (0–4), consistent within session | Prevents color collision; simpler than per-fund-code static map |
| Vercel plan | Pro required (60s timeout) | Nightly sync cannot complete within 10s Hobby timeout |
| Sharpe/Drawdown/Volatility | Computed on-demand from TEFAS NAV history | Already computed in `analytics.ts`; no need to pre-compute and store |

---

## 8. Out of Scope

- Real-time price streaming (existing TEFAS NAV caching is sufficient)
- Mobile app / React Native version
- Multi-user Fintables authentication (single owner token used server-side)
- Crypto or VİOP data
- Backtesting or simulation features
- Social/sharing features beyond shareable Örtüşme URLs
- Automated trading or broker integration
- Non-BIST funds or international ETFs

---

*Spec generated from brainstorming session on 2026-03-17. All design decisions confirmed by project owner. Revised after spec review to add table DDL, API response schemas, MCP tool documentation, formula clarifications, and open-decision resolutions.*
