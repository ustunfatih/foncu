-- Fix stopaj values stored as decimals (e.g. 0.175) instead of percentages (17.5)
-- Fintables stored stopaj as a fraction; multiply by 100 to get the display percentage.
-- Only touches rows where 0 < stopaj < 1 (decimal fractions), leaving 0 and correct
-- integer/float percentage values untouched.
UPDATE fund_profiles
SET stopaj = stopaj * 100
WHERE stopaj IS NOT NULL
  AND stopaj > 0
  AND stopaj < 1;
