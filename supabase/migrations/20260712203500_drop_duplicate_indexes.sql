-- Earlier deployments may have both the legacy index names and the canonical
-- bootstrap index names. Keep the established names and remove only duplicates.
drop index if exists public.historical_data_fund_date_idx;
drop index if exists public.portfolios_user_idx;
