-- AE-Sub-Revenue-Tracker: full setup script
-- Paste into Supabase SQL Editor and run once. Idempotent-ish (safe to re-run on a fresh DB).

------------------------------------------------------------
-- 1. Extensions
------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "citext";

------------------------------------------------------------
-- 2. Config (single-row)
------------------------------------------------------------
create table if not exists public.config (
  key                  text primary key,
  stripe_tax_rate      numeric(5,4) not null default 0.2300,
  renewal_window_days  int not null default 60,
  updated_at           timestamptz not null default now()
);
insert into public.config (key) values ('default') on conflict do nothing;

------------------------------------------------------------
-- 3. Allowlist
------------------------------------------------------------
create table if not exists public.allowed_users (
  email      citext primary key,
  role       text not null default 'viewer' check (role in ('owner','viewer')),
  created_at timestamptz not null default now()
);

insert into public.allowed_users (email, role) values
  ('sutpe96@gmail.com', 'owner')
on conflict (email) do update set role = excluded.role;

------------------------------------------------------------
-- 4. Sales / subscriptions
------------------------------------------------------------
do $$ begin
  create type public.sale_category as enum ('stripe','nowpayments');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sale_plan as enum ('1m','3m');
exception when duplicate_object then null; end $$;

create table if not exists public.sales (
  id               uuid primary key default uuid_generate_v4(),
  email            citext not null,
  category         public.sale_category not null,
  plan             public.sale_plan not null,
  paid_amount      numeric(10,2) not null check (paid_amount >= 0),
  transaction_date date not null,
  expiration_date  date generated always as (
    case plan
      when '1m'::public.sale_plan then transaction_date + interval '1 month'
      when '3m'::public.sale_plan then transaction_date + interval '3 months'
    end
  ) stored,
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id)
);

create index if not exists sales_email_idx            on public.sales (email);
create index if not exists sales_transaction_date_idx on public.sales (transaction_date desc);
create index if not exists sales_expiration_date_idx  on public.sales (expiration_date);
create index if not exists sales_category_idx         on public.sales (category);
create unique index if not exists sales_dedup_idx     on public.sales (email, transaction_date, paid_amount);

------------------------------------------------------------
-- 5. Team members
------------------------------------------------------------
create table if not exists public.team_members (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null unique,
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- 6. Monthly allocation snapshots
------------------------------------------------------------
create table if not exists public.monthly_allocations (
  year       int not null check (year between 2020 and 2100),
  month      int not null check (month between 1 and 12),
  member_id  uuid not null references public.team_members(id) on delete restrict,
  pct        numeric(5,2) not null check (pct >= 0 and pct <= 100),
  frozen     boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (year, month, member_id)
);

create index if not exists ma_year_month_idx on public.monthly_allocations (year, month);

------------------------------------------------------------
-- 6b. Member payouts (records of money actually paid to teammates)
------------------------------------------------------------
create table if not exists public.member_payouts (
  id         uuid primary key default uuid_generate_v4(),
  member_id  uuid not null references public.team_members(id) on delete restrict,
  year       int not null check (year between 2020 and 2100),
  month      int not null check (month between 1 and 12),
  paid_at    date not null,
  amount     numeric(10,2) not null check (amount > 0),
  notes      text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists mp_member_idx     on public.member_payouts (member_id);
create index if not exists mp_year_month_idx on public.member_payouts (year, month);
create index if not exists mp_paid_at_idx    on public.member_payouts (paid_at desc);

------------------------------------------------------------
-- 7. Triggers (frozen-row guard, sum<=100 guard)
------------------------------------------------------------
create or replace function public.tg_block_frozen_allocations() returns trigger
language plpgsql as $$
begin
  if (TG_OP = 'UPDATE' or TG_OP = 'DELETE') and OLD.frozen = true then
    raise exception 'Cannot modify frozen allocation row for %-%', OLD.year, OLD.month;
  end if;
  return new;
end $$;

drop trigger if exists trg_ma_block_frozen on public.monthly_allocations;
create trigger trg_ma_block_frozen
  before update or delete on public.monthly_allocations
  for each row execute function public.tg_block_frozen_allocations();

create or replace function public.tg_alloc_sum_check() returns trigger
language plpgsql as $$
declare s numeric(6,2);
begin
  select coalesce(sum(pct),0) into s
    from public.monthly_allocations
    where year = NEW.year and month = NEW.month
      and member_id <> coalesce(NEW.member_id, '00000000-0000-0000-0000-000000000000'::uuid);
  if (s + NEW.pct) > 100 then
    raise exception 'Allocation sum for %-% would exceed 100%% (got %)', NEW.year, NEW.month, s + NEW.pct;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_ma_sum_check on public.monthly_allocations;
create trigger trg_ma_sum_check
  before insert or update on public.monthly_allocations
  for each row execute function public.tg_alloc_sum_check();

------------------------------------------------------------
-- 8. Views
------------------------------------------------------------
create or replace view public.v_sales_enriched as
select
  s.*,
  case s.category
    when 'stripe'      then round(s.paid_amount * (1 - c.stripe_tax_rate), 2)
    when 'nowpayments' then s.paid_amount
  end as net_amount,
  case s.category
    when 'stripe'      then round(s.paid_amount * c.stripe_tax_rate, 2)
    when 'nowpayments' then 0::numeric(10,2)
  end as tax_setaside,
  (s.expiration_date >= current_date) as is_active,
  (s.expiration_date - current_date)  as days_until_expiry
from public.sales s
cross join (select stripe_tax_rate from public.config where key = 'default') c;

create or replace view public.v_monthly_revenue as
select
  date_trunc('month', transaction_date)::date as month_start,
  category,
  count(*)                       as sale_count,
  sum(paid_amount)::numeric(12,2) as gross,
  sum(tax_setaside)::numeric(12,2) as tax,
  sum(net_amount)::numeric(12,2)   as net
from public.v_sales_enriched
group by 1, 2
order by 1, 2;

create or replace view public.v_sales_with_renewal_flag as
select
  s.*,
  exists(
    select 1
    from public.sales s2
    cross join (select renewal_window_days from public.config where key='default') c
    where s2.email = s.email
      and s2.transaction_date < s.transaction_date
      and (s.transaction_date - s2.expiration_date) <= c.renewal_window_days
  ) as is_renewal
from public.sales s;

------------------------------------------------------------
-- 9. RPCs
------------------------------------------------------------
create or replace function public.fn_mtd_kpis(p_today date default current_date)
returns table (
  gross_mtd numeric, tax_mtd numeric, net_mtd numeric,
  new_subs_mtd int, renewals_mtd int
)
language sql stable as $$
  with month_sales as (
    select * from public.v_sales_with_renewal_flag
    where date_trunc('month', transaction_date) = date_trunc('month', p_today)
  ),
  enriched as (
    select ms.*, vs.net_amount, vs.tax_setaside
    from month_sales ms
    join public.v_sales_enriched vs on vs.id = ms.id
  )
  select
    coalesce(sum(paid_amount),0),
    coalesce(sum(tax_setaside),0),
    coalesce(sum(net_amount),0),
    coalesce(sum((not is_renewal)::int),0),
    coalesce(sum(is_renewal::int),0)
  from enriched;
$$;

create or replace function public.fn_payouts(p_year int, p_month int)
returns table (member_id uuid, member_name text, pct numeric, payout numeric)
language sql stable as $$
  with month_net as (
    select coalesce(sum(net_amount),0) as net
    from public.v_sales_enriched
    where extract(year  from transaction_date) = p_year
      and extract(month from transaction_date) = p_month
  ),
  allocs as (
    select ma.member_id, tm.name, ma.pct
    from public.monthly_allocations ma
    join public.team_members tm on tm.id = ma.member_id
    where ma.year = p_year and ma.month = p_month
  )
  select a.member_id, a.name, a.pct,
         round((select net from month_net) * a.pct / 100.0, 2)
  from allocs a
  union all
  select null::uuid, 'Operational costs',
         100 - coalesce((select sum(pct) from allocs), 0),
         round(
           (select net from month_net) *
           (100 - coalesce((select sum(pct) from allocs), 0)) / 100.0, 2);
$$;

create or replace function public.fn_roll_allocations(p_year int, p_month int)
returns void language plpgsql security definer as $$
declare
  prev_y int; prev_m int;
begin
  update public.monthly_allocations
     set frozen = true
   where ((year < p_year) or (year = p_year and month < p_month))
     and frozen = false;

  if exists(select 1 from public.monthly_allocations
            where year = p_year and month = p_month) then
    return;
  end if;

  if p_month = 1 then
    prev_y := p_year - 1; prev_m := 12;
  else
    prev_y := p_year;     prev_m := p_month - 1;
  end if;

  insert into public.monthly_allocations (year, month, member_id, pct, frozen)
  select p_year, p_month, member_id, pct, false
    from public.monthly_allocations
   where year = prev_y and month = prev_m;

  if not found then
    insert into public.monthly_allocations (year, month, member_id, pct, frozen)
    select p_year, p_month, id, 0, false
      from public.team_members where active = true;
  end if;
end $$;

------------------------------------------------------------
-- 10. RLS
------------------------------------------------------------
alter table public.sales               enable row level security;
alter table public.team_members        enable row level security;
alter table public.monthly_allocations enable row level security;
alter table public.member_payouts      enable row level security;
alter table public.allowed_users       enable row level security;
alter table public.config              enable row level security;

-- SECURITY DEFINER: must bypass RLS on allowed_users, otherwise the policy that
-- calls these functions deadlocks (the function can't read the table it's checking).
create or replace function public.is_allowlisted() returns boolean
language sql stable security definer as $$
  select exists(
    select 1 from public.allowed_users
    where email = (auth.jwt() ->> 'email')::citext
  );
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer as $$
  select exists(
    select 1 from public.allowed_users
    where email = (auth.jwt() ->> 'email')::citext and role = 'owner'
  );
$$;

drop policy if exists sales_select on public.sales;
drop policy if exists tm_select    on public.team_members;
drop policy if exists ma_select    on public.monthly_allocations;
drop policy if exists mp_select    on public.member_payouts;
drop policy if exists au_select    on public.allowed_users;
drop policy if exists cfg_select   on public.config;
drop policy if exists sales_write  on public.sales;
drop policy if exists tm_write     on public.team_members;
drop policy if exists ma_write     on public.monthly_allocations;
drop policy if exists mp_write     on public.member_payouts;
drop policy if exists au_write     on public.allowed_users;
drop policy if exists cfg_write    on public.config;

create policy sales_select on public.sales              for select using (public.is_allowlisted());
create policy tm_select    on public.team_members       for select using (public.is_allowlisted());
create policy ma_select    on public.monthly_allocations for select using (public.is_allowlisted());
create policy mp_select    on public.member_payouts     for select using (public.is_allowlisted());
create policy au_select    on public.allowed_users      for select using (public.is_allowlisted());
create policy cfg_select   on public.config             for select using (public.is_allowlisted());

create policy sales_write on public.sales              for all using (public.is_owner()) with check (public.is_owner());
create policy tm_write    on public.team_members       for all using (public.is_owner()) with check (public.is_owner());
create policy ma_write    on public.monthly_allocations for all using (public.is_owner()) with check (public.is_owner());
create policy mp_write    on public.member_payouts     for all using (public.is_owner()) with check (public.is_owner());
create policy au_write    on public.allowed_users      for all using (public.is_owner()) with check (public.is_owner());
create policy cfg_write   on public.config             for all using (public.is_owner()) with check (public.is_owner());
