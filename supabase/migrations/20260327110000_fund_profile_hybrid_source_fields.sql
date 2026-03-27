-- =============================================================
-- hybrid source support for fund profiles — 2026-03-27
-- Adds public-source metadata needed by the KAP holdings workflow.
-- =============================================================

ALTER TABLE fund_profiles
  ADD COLUMN IF NOT EXISTS kap_link text,
  ADD COLUMN IF NOT EXISTS kap_fund_id text;

CREATE INDEX IF NOT EXISTS fund_profiles_kap_fund_id_idx
  ON fund_profiles (kap_fund_id);
