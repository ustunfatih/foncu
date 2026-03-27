-- =============================================================
-- fund holdings snapshots — 2026-03-27
-- Adds a manifest table so monthly holdings loads have an explicit
-- canonical report period and acquisition timestamp.
-- =============================================================

CREATE TABLE IF NOT EXISTS fund_holdings_snapshots (
  id                bigserial PRIMARY KEY,
  rapor_yil         integer NOT NULL,
  rapor_ay          integer NOT NULL,
  acquired_at       timestamptz NOT NULL DEFAULT now(),
  source            text NOT NULL DEFAULT 'fintables',
  fund_count        integer NOT NULL DEFAULT 0,
  holding_count     integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'ready',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rapor_yil, rapor_ay)
);

ALTER TABLE fund_holdings_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fund_holdings_snapshots_public_read"
  ON fund_holdings_snapshots FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS fund_holdings_snapshots_period_idx
  ON fund_holdings_snapshots (rapor_yil DESC, rapor_ay DESC);

