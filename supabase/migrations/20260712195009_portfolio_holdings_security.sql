-- Canonical legacy tables used by read APIs.
create table if not exists public.funds (
  code text primary key,
  title text,
  kind text check (kind in ('YAT', 'EMK', 'BYF')),
  latest_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.historical_data (
  id bigserial primary key,
  fund_code text not null references public.funds(code) on delete cascade,
  date date not null,
  price numeric,
  market_cap numeric,
  investor_count integer,
  created_at timestamptz not null default now(),
  unique (fund_code, date)
);

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Portföyüm',
  fund_list jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.portfolio_holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  fund_code text not null,
  units numeric not null default 0 check (units >= 0),
  average_cost numeric not null default 0 check (average_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, fund_code)
);

create index if not exists historical_data_fund_date_idx on public.historical_data (fund_code, date desc);
create index if not exists portfolios_user_idx on public.portfolios (user_id);
create index if not exists portfolio_holdings_portfolio_idx on public.portfolio_holdings (portfolio_id);

alter table public.funds enable row level security;
alter table public.historical_data enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_holdings enable row level security;

drop policy if exists "Public read access to funds" on public.funds;
create policy "Public read access to funds" on public.funds for select to anon, authenticated using (true);
drop policy if exists "Public read access to historical_data" on public.historical_data;
create policy "Public read access to historical_data" on public.historical_data for select to anon, authenticated using (true);

drop policy if exists "Users can view own portfolios" on public.portfolios;
drop policy if exists "Users can insert own portfolios" on public.portfolios;
drop policy if exists "Users can update own portfolios" on public.portfolios;
drop policy if exists "Users can delete own portfolios" on public.portfolios;
create policy "Users can view own portfolios" on public.portfolios for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own portfolios" on public.portfolios for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own portfolios" on public.portfolios for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own portfolios" on public.portfolios for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can view own portfolio holdings" on public.portfolio_holdings for select to authenticated
  using (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid())));
create policy "Users can insert own portfolio holdings" on public.portfolio_holdings for insert to authenticated
  with check (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid())));
create policy "Users can update own portfolio holdings" on public.portfolio_holdings for update to authenticated
  using (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid())));
create policy "Users can delete own portfolio holdings" on public.portfolio_holdings for delete to authenticated
  using (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid())));

grant select on public.funds, public.historical_data to anon, authenticated;
grant select, insert, update, delete on public.portfolios, public.portfolio_holdings to authenticated;
revoke all on public.portfolios, public.portfolio_holdings from anon;

-- Tighten the current intelligence tables created by earlier migrations.
drop policy if exists "fund_profiles_public_read" on public.fund_profiles;
create policy "fund_profiles_public_read" on public.fund_profiles for select to anon, authenticated using (true);
drop policy if exists "fund_holdings_public_read" on public.fund_holdings;
create policy "fund_holdings_public_read" on public.fund_holdings for select to anon, authenticated using (true);
drop policy if exists "kap_events_public_read" on public.kap_events;
create policy "kap_events_public_read" on public.kap_events for select to anon, authenticated using (true);
drop policy if exists "fund_holdings_snapshots_public_read" on public.fund_holdings_snapshots;
create policy "fund_holdings_snapshots_public_read" on public.fund_holdings_snapshots for select to anon, authenticated using (true);

grant select on public.fund_profiles, public.fund_holdings, public.kap_events, public.fund_holdings_snapshots to anon, authenticated;
revoke insert, update, delete on public.funds, public.historical_data, public.fund_profiles, public.fund_holdings, public.kap_events, public.fund_holdings_snapshots from anon, authenticated;

-- Convert legacy saved fund selections into zero-unit holdings without inventing financial data.
insert into public.portfolio_holdings (portfolio_id, fund_code, units, average_cost)
select p.id, upper(item.value->>'code'), 0, 0
from public.portfolios p
cross join lateral jsonb_array_elements(coalesce(p.fund_list, '[]'::jsonb)) item(value)
where item.value ? 'code' and nullif(item.value->>'code', '') is not null
on conflict (portfolio_id, fund_code) do nothing;
