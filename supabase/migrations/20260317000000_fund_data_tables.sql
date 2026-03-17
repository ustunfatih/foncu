-- =============================================================
-- foncu overhaul migration — 2026-03-17
-- Creates three new tables:
--   1. fund_holdings   — stock-level holdings per fund per monthly report
--   2. fund_profiles   — fund metadata + pre-computed metrics (RSI, SMA, returns)
--   3. kap_events      — KAP/BIST event calendar (replaces TradingEconomics)
-- =============================================================

-- ── 1. fund_holdings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fund_holdings (
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

ALTER TABLE fund_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fund_holdings_public_read"
  ON fund_holdings FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS fund_holdings_fon_idx
  ON fund_holdings (fon_kodu);
CREATE INDEX IF NOT EXISTS fund_holdings_hisse_idx
  ON fund_holdings (hisse_kodu);
CREATE INDEX IF NOT EXISTS fund_holdings_rapor_idx
  ON fund_holdings (rapor_yil DESC, rapor_ay DESC);

-- ── 2. fund_profiles ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fund_profiles (
  fon_kodu                    text PRIMARY KEY,
  unvan                       text NOT NULL,
  fon_tipi                    text,             -- 'mutual' | 'pension' | 'exchange'
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
  -- AUM + investor count (latest from nightly sync)
  fon_buyuklugu               numeric,          -- latest AUM (TRY)
  yatirimci_sayisi            integer,          -- latest investor count
  -- Return metrics (pre-computed during nightly sync)
  getiri_1g                   double precision, -- 1-day return %
  getiri_1h                   double precision, -- 1-week return %
  getiri_1a                   double precision, -- 1-month return %
  getiri_3a                   double precision, -- 3-month return %
  getiri_6a                   double precision, -- 6-month return %
  getiri_ytd                  double precision, -- year-to-date return %
  getiri_1y                   double precision, -- 1-year return %
  -- Technical indicators (pre-computed from Fintables OHLCV at sync time)
  rsi_14                      double precision, -- RSI with 14-day period
  sma_20                      double precision, -- 20-day simple moving average
  sma_50                      double precision, -- 50-day simple moving average
  sma_200                     double precision, -- 200-day simple moving average
  son_fiyat                   double precision, -- latest NAV
  ma200_ustu                  boolean,          -- true if son_fiyat > sma_200
  sma_kesisim_20_50           boolean,          -- true if sma_20 crossed above sma_50 in last 5 days
  rsi_sinyal                  text,             -- 'guclu_al' (<25) | 'al' (25-35) | 'dikkat' (35-45) | 'normal' (>=45)
  -- Asset allocation (latest, from gunluk_fon_varlik_sinifi_dagilimlari)
  varlik_dagilimi             jsonb,            -- e.g. [{"kod":"HS","ad":"Hisse Senedi","agirlik":78.2}, ...]
  guncelleme_zamani           timestamptz DEFAULT now()
);

ALTER TABLE fund_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fund_profiles_public_read"
  ON fund_profiles FOR SELECT USING (true);

-- ── 3. kap_events ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kap_events (
  id                bigserial PRIMARY KEY,
  olay_tarihi       date NOT NULL,
  olay_tipi         text NOT NULL,   -- 'temettu' | 'bilanco' | 'genel_kurul' | 'kap_bildirimi' | 'fon_raporu'
  hisse_kodu        text,            -- BIST ticker (nullable)
  fon_kodu          text,            -- fund code (nullable)
  baslik            text NOT NULL,
  aciklama          text,
  deger             text,            -- human-readable value e.g. "₺4.20 brüt temettü"
  kap_bildirim_id   bigint,          -- KAP disclosure ID for deep linking
  guncelleme_zamani timestamptz DEFAULT now()
);

ALTER TABLE kap_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kap_events_public_read"
  ON kap_events FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS kap_events_tarih_idx
  ON kap_events (olay_tarihi);
CREATE INDEX IF NOT EXISTS kap_events_tipi_idx
  ON kap_events (olay_tipi);

-- =============================================================
-- Verification query (run this after to confirm):
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('fund_holdings', 'fund_profiles', 'kap_events');
-- Expected: 3 rows returned.
-- =============================================================
