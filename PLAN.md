# AE-Sub-Revenue-Tracker — Implementation Plan

A single-operator subscription revenue dashboard. Stefan enters sales; the team logs in to view dashboards. Static SPA on GitHub Pages, Supabase backend.

---

## Decisions confirmed (2026-05-01)

| Decision | Choice |
|---|---|
| UI library | Tailwind CSS + shadcn/ui |
| Renewal definition | Same email AND prior sub expired within last 60 days (anything older = re-acquisition) |
| Monthly cron rollover | Yes — scheduled Supabase Edge Function on top of the on-app-boot RPC |
| Sale deletion | Hard delete (owner-only) |
| CSV date format | `MM/DD/YYYY` (US) |
| Owner email | `pesut@yourbow.com` |
| Currency | USD only, no FX |

---

## 0. Opinionated Defaults

| Decision | Default | Override |
|---|---|---|
| UI library | **Tailwind CSS + shadcn/ui** | Plain CSS modules if shadcn feels heavy |
| Router | **HashRouter** (GH Pages friendly) | BrowserRouter + 404.html SPA fallback |
| Forms | **react-hook-form + zod** | Native form state |
| Data fetching | **@tanstack/react-query** | Plain `useEffect` + `useState` |
| CSV parsing | **PapaParse** | — |
| Date math | **date-fns** | dayjs |
| Allocation model | **`monthly_allocations` snapshot table** keyed by `(year, month, member_id)` | Effective-dated rows (rejected — harder to query) |
| Aggregations | **Postgres views + RPCs**, client renders | Client-side reduce |
| Tax rate | **DB-level constant table** (`config` row) so it's swappable later | Hardcoded 0.23 |
| Renewal detection | **Auto-derived** with 60-day expiry window | Manual flag |
| Auth | **Magic link + allowlist table** queried by RLS | Hardcoded `auth.email() IN (...)` policy |

---

## 1. Repo Layout

```
AE-Sub-Revenue-Tracker/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── public/
│   ├── 404.html                    # SPA fallback (only if BrowserRouter chosen)
│   └── favicon.svg
├── src/
│   ├── main.tsx
│   ├── App.tsx                     # Router + auth gate
│   ├── index.css                   # Tailwind directives
│   ├── lib/
│   │   ├── supabase.ts             # Singleton client
│   │   ├── queryClient.ts          # react-query config
│   │   ├── env.ts                  # typed env access
│   │   ├── format.ts               # currency/date formatters (MM/DD/YYYY)
│   │   └── calc.ts                 # net revenue, expiration, days-until
│   ├── auth/
│   │   ├── AuthProvider.tsx        # session context
│   │   ├── LoginPage.tsx
│   │   ├── AuthCallback.tsx
│   │   └── useSession.ts
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── SalesPage.tsx
│   │   ├── ActiveSubsPage.tsx
│   │   ├── TeamAllocationPage.tsx
│   │   ├── PayoutsPage.tsx
│   │   └── ImportPage.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── TopBar.tsx
│   │   ├── sales/
│   │   │   ├── SaleForm.tsx
│   │   │   ├── SalesTable.tsx
│   │   │   └── SalesFilters.tsx
│   │   ├── dashboard/
│   │   │   ├── KpiCards.tsx
│   │   │   ├── MonthlyTrendChart.tsx
│   │   │   └── CategoryBreakdown.tsx
│   │   ├── subs/
│   │   │   ├── ActiveSubsTable.tsx
│   │   │   └── ExpirationBadge.tsx
│   │   ├── team/
│   │   │   ├── AllocationGrid.tsx
│   │   │   ├── PayoutTable.tsx
│   │   │   └── MonthPicker.tsx
│   │   ├── import/
│   │   │   ├── CsvDropzone.tsx
│   │   │   ├── ImportPreview.tsx
│   │   │   └── ImportRunner.tsx
│   │   └── ui/                     # shadcn-generated primitives
│   ├── data/
│   │   ├── sales.ts                # all `sales` queries/mutations
│   │   ├── allocations.ts
│   │   ├── teamMembers.ts
│   │   ├── revenue.ts              # calls RPC views
│   │   └── allowlist.ts
│   └── types/
│       ├── db.ts                   # generated from supabase
│       └── domain.ts               # Plan, Category, etc.
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql
│   │   ├── 0002_views.sql
│   │   ├── 0003_rpcs.sql
│   │   └── 0004_rls.sql
│   ├── functions/
│   │   └── roll-allocations/       # scheduled Edge Function
│   │       └── index.ts
│   └── seed.sql
├── .env.example
├── .env.local                      # gitignored
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

**Env vars** (Vite requires `VITE_` prefix to expose to client):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_OWNER_EMAIL=pesut@yourbow.com
VITE_APP_BASE=/AE-Sub-Revenue-Tracker/
```

`src/lib/env.ts` exports a typed object after asserting all are present at startup — fail-fast on misconfig.

---

## 2. Supabase Schema (DDL)

### 2.1 Core tables

```sql
-- 0001_init.sql

create extension if not exists "uuid-ossp";
create extension if not exists "citext";

-- Tax rate / config (extensible). Single row keyed by 'default'.
create table public.config (
  key            text primary key,
  stripe_tax_rate numeric(5,4) not null default 0.2300,
  renewal_window_days int not null default 60,
  updated_at     timestamptz not null default now()
);
insert into public.config (key) values ('default');

-- Allowlist table — only emails listed here can read.
create table public.allowed_users (
  email      citext primary key,
  role       text not null default 'viewer'  check (role in ('owner','viewer')),
  created_at timestamptz not null default now()
);

-- Sales / subscriptions — one row per transaction.
create type public.sale_category as enum ('stripe','nowpayments');
create type public.sale_plan     as enum ('1m','3m');

create table public.sales (
  id               uuid primary key default uuid_generate_v4(),
  email            citext not null,
  category         sale_category not null,
  plan             sale_plan not null,
  paid_amount      numeric(10,2) not null check (paid_amount >= 0),
  transaction_date date not null,
  expiration_date  date generated always as (
    case plan
      when '1m'::sale_plan then transaction_date + interval '1 month'
      when '3m'::sale_plan then transaction_date + interval '3 months'
    end
  ) stored,
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id)
);

create index sales_email_idx            on public.sales (email);
create index sales_transaction_date_idx on public.sales (transaction_date desc);
create index sales_expiration_date_idx  on public.sales (expiration_date);
create index sales_category_idx         on public.sales (category);
create unique index sales_dedup_idx     on public.sales (email, transaction_date, paid_amount);

-- Team members — up to 11 active at a time.
create table public.team_members (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null unique,
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Monthly allocation snapshot. One row per (year, month, member).
-- Past months: frozen. Current month: editable. Future months: don't exist until rolled forward.
create table public.monthly_allocations (
  year       int not null check (year between 2020 and 2100),
  month      int not null check (month between 1 and 12),
  member_id  uuid not null references public.team_members(id) on delete restrict,
  pct        numeric(5,2) not null check (pct >= 0 and pct <= 100),
  frozen     boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (year, month, member_id)
);

create index ma_year_month_idx on public.monthly_allocations (year, month);
```

### 2.2 Views (read-side aggregations)

```sql
-- 0002_views.sql

-- Per-sale recognized (net) revenue, joined to current tax rate.
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

-- Monthly bucket by category.
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

-- Renewals: same email AND prior sub's expiration was within renewal_window_days of this sale's transaction date.
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
```

### 2.3 RPCs

```sql
-- 0003_rpcs.sql

-- KPI snapshot for current month.
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

-- Payouts for a given month: net revenue × frozen pct per member, plus ops costs row.
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

-- Roll allocations forward: copy last month's pct into target month if target is empty.
-- Idempotent — safe to call repeatedly. Also freezes any past months that are still unfrozen.
create or replace function public.fn_roll_allocations(p_year int, p_month int)
returns void language plpgsql as $$
declare
  prev_y int; prev_m int;
begin
  -- Freeze any month strictly before (p_year, p_month).
  update public.monthly_allocations
     set frozen = true
   where (year < p_year) or (year = p_year and month < p_month);

  -- If target month already has rows, do nothing.
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

  -- If no previous month either, seed with active members at 0%.
  if not found then
    insert into public.monthly_allocations (year, month, member_id, pct, frozen)
    select p_year, p_month, id, 0, false
      from public.team_members where active = true;
  end if;
end $$;
```

### 2.4 RLS

```sql
-- 0004_rls.sql

alter table public.sales               enable row level security;
alter table public.team_members        enable row level security;
alter table public.monthly_allocations enable row level security;
alter table public.allowed_users       enable row level security;
alter table public.config              enable row level security;

-- Helper: is the caller in the allowlist?
create or replace function public.is_allowlisted() returns boolean
language sql stable as $$
  select exists(
    select 1 from public.allowed_users
    where email = auth.jwt() ->> 'email'
  );
$$;

create or replace function public.is_owner() returns boolean
language sql stable as $$
  select exists(
    select 1 from public.allowed_users
    where email = auth.jwt() ->> 'email' and role = 'owner'
  );
$$;

-- Read: any allowlisted user.
create policy sales_select on public.sales              for select using (public.is_allowlisted());
create policy tm_select    on public.team_members       for select using (public.is_allowlisted());
create policy ma_select    on public.monthly_allocations for select using (public.is_allowlisted());
create policy au_select    on public.allowed_users      for select using (public.is_allowlisted());
create policy cfg_select   on public.config             for select using (public.is_allowlisted());

-- Write: owner only.
create policy sales_write on public.sales              for all using (public.is_owner()) with check (public.is_owner());
create policy tm_write    on public.team_members       for all using (public.is_owner()) with check (public.is_owner());
create policy ma_write    on public.monthly_allocations for all using (public.is_owner()) with check (public.is_owner());
create policy au_write    on public.allowed_users      for all using (public.is_owner()) with check (public.is_owner());
create policy cfg_write   on public.config             for all using (public.is_owner()) with check (public.is_owner());

-- Trigger to block updates to frozen allocation rows.
create or replace function public.tg_block_frozen_allocations() returns trigger
language plpgsql as $$
begin
  if (TG_OP = 'UPDATE' or TG_OP = 'DELETE') and OLD.frozen = true then
    raise exception 'Cannot modify frozen allocation row for %-%', OLD.year, OLD.month;
  end if;
  return new;
end $$;

create trigger trg_ma_block_frozen
  before update or delete on public.monthly_allocations
  for each row execute function public.tg_block_frozen_allocations();

-- Trigger to enforce sum(pct) <= 100 within a month.
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

create trigger trg_ma_sum_check
  before insert or update on public.monthly_allocations
  for each row execute function public.tg_alloc_sum_check();
```

### 2.5 Seed

```sql
insert into public.allowed_users (email, role) values
  ('pesut@yourbow.com', 'owner');
-- viewers added later via UI or psql.
```

---

## 3. Calculation Logic

| Quantity | Formula | Where |
|---|---|---|
| Per-sale net (Stripe) | `paid × (1 - stripe_tax_rate)` | `v_sales_enriched` |
| Per-sale net (NowPayments) | `paid` | `v_sales_enriched` |
| Per-sale tax setaside | `paid × stripe_tax_rate` if Stripe else 0 | `v_sales_enriched` |
| Expiration date | generated column on `sales` | DB |
| `is_active` | `expiration_date >= current_date` | view (recomputed every read) |
| `days_until_expiry` | `expiration_date - current_date` | view |
| Monthly gross/tax/net | sum over `v_sales_enriched`, `date_trunc('month', transaction_date)` | `v_monthly_revenue` |
| MTD KPIs | RPC `fn_mtd_kpis` | RPC |
| Renewal flag | prior sale with same email whose expiration was within `renewal_window_days` of this transaction | `v_sales_with_renewal_flag` |
| Per-member payout | `month_net × pct / 100` | RPC `fn_payouts` |
| Ops cost % | `100 - sum(member pct)` | RPC `fn_payouts` |

**Rule of thumb:** anything that aggregates across rows lives in SQL (view or RPC). Anything per-row presentation (formatting, color thresholds) lives in client.

---

## 4. Allocation History Model

**Chosen model:** monthly snapshot table `monthly_allocations` keyed by `(year, month, member_id)`.

### Lifecycle

1. **Editing the current month:** UPSERT into `monthly_allocations` for `(this_year, this_month, member_id)`. `frozen` stays `false`.
2. **Past months:** rows have `frozen = true`. Trigger blocks updates.
3. **Future months:** rows don't exist yet.

### Month rollover — two layers

1. **On-app-boot:** `fn_roll_allocations(current_year, current_month)` is called once per session from the app (idempotent, cheap).
2. **Scheduled Edge Function:** runs daily at 00:05 UTC, calls the same RPC. This guarantees freezing happens even if no human logs in.

### Sum > 100 enforcement

- Client-side: validation in `AllocationGrid` blocks save when sum > 100.
- Server-side: `tg_alloc_sum_check` trigger raises if total would exceed 100.

---

## 5. UI / Page Structure

| Route | Page | Key components |
|---|---|---|
| `/login` | `LoginPage` | email input, send-magic-link button |
| `/auth/callback` | `AuthCallback` | exchanges hash, redirects |
| `/` | `DashboardPage` | `KpiCards`, `MonthlyTrendChart`, `CategoryBreakdown` |
| `/sales` | `SalesPage` | `SaleForm` (modal trigger), `SalesFilters`, `SalesTable` |
| `/active` | `ActiveSubsPage` | `ActiveSubsTable` with `ExpirationBadge` |
| `/team` | `TeamAllocationPage` | `AllocationGrid`, member CRUD drawer |
| `/payouts` | `PayoutsPage` | `MonthPicker`, `PayoutTable` |
| `/import` | `ImportPage` | `CsvDropzone`, `ImportPreview`, `ImportRunner` (owner-only) |

`AppShell` owns layout: sidebar nav + topbar with user email + logout. `App.tsx` wraps everything in `AuthProvider` + `QueryClientProvider` and gates non-login routes behind a `RequireAuth` wrapper.

All dates rendered to the user use `MM/DD/YYYY`. Centralize this in `src/lib/format.ts`.

---

## 6. Sale Form Behavior

- **Fields:** email (required, email format), category (segmented: Stripe / NowPayments — default Stripe), plan (segmented: 1m / 3m — default 1m), paid amount (numeric, defaults to $39 for 1m / $70 for 3m, recomputes default when plan changes if user hasn't manually edited), transaction date (date picker showing MM/DD/YYYY, default today), notes (textarea, optional).
- **Validation (zod):** email valid; paid > 0; date not in future (warn but allow with confirm).
- **Submit:**
  1. Insert into `sales`. Expiration is computed by the generated column.
  2. On unique-violation (dedup index hit) → toast "duplicate sale detected" — block.
  3. On success → toast "Sale recorded ($X net)", react-query invalidates `sales`, `v_monthly_revenue`, `fn_mtd_kpis` queries.
  4. Form resets but keeps category/plan selection for fast batch entry.

---

## 7. Charts

**Library:** Recharts.

**Monthly trend:** stacked `BarChart` is recommended over line — shows category split natively.
- Components: `ResponsiveContainer` → `BarChart` → `XAxis` (month label) + `YAxis` ($) + `Tooltip` + `Legend` + two `Bar` (`stackId="rev"`, one per category, color-coded).
- Toggle (gross / tax / net) is a tab control above the chart that swaps the data key.

**Data source:** `v_monthly_revenue`, fetched as one query, pivoted client-side into `[{ month: '2026-01', stripe: 1200, nowpayments: 480 }, ...]`.

**Category breakdown (current month):** `PieChart` or two-bar `BarChart` showing Stripe vs NowPayments net revenue.

---

## 8. CSV Import Flow

**Library:** PapaParse (`header: true, skipEmptyLines: true, dynamicTyping: false`).

**Date parsing:** `MM/DD/YYYY` only. Use `date-fns/parse` with format string `MM/dd/yyyy`. Reject any row that doesn't parse.

**Flow:**
1. `CsvDropzone` accepts a file, parses to `rows[]`.
2. `ImportPreview` shows:
   - Column mapping UI (auto-mapped by header name; user can re-map).
   - Validation summary (total rows, valid, skipped-with-reason).
   - Per-row validation: email present + valid; category in `{Stripe, Nowpayments}`; plan recognizable (`1` or `3` → `1m`/`3m`); paid is a number; transaction date parseable as MM/DD/YYYY.
   - Skip rules: ignore `Active`, `Expires in`, `Status Check` columns entirely (recomputed).
   - Highlight rows that already exist (matched by `(email, transaction_date, paid)` dedup key).
3. `ImportRunner` does a chunked insert (500 rows/batch) using Supabase's batch insert. Uses `onConflict: 'email,transaction_date,paid_amount'` with `ignoreDuplicates: true` so re-running is safe.
4. Final report: `X inserted, Y skipped (duplicate), Z failed (errors listed)`.

**Owner-only.** RLS already blocks viewers; the route also hides the menu item for non-owners.

---

## 9. Auth Flow

### Supabase setup

1. Create project. In **Authentication → Providers**: enable Email; disable signups.
2. **Authentication → URL Configuration:**
   - Site URL: `https://<github-username>.github.io/AE-Sub-Revenue-Tracker/`
   - Redirect URLs: same URL, plus `http://localhost:5173/` for dev.
3. **Authentication → Email Templates:** customize the magic link subject/body.
4. Insert owner row into `allowed_users` via SQL editor.

### Allowlist enforcement

Two layers:
- **DB:** RLS uses `is_allowlisted()` which queries `allowed_users`. Real security boundary.
- **UI:** after sign-in, app calls `select 1 from allowed_users where email = ?`. If empty, show "Your email is not authorized — contact Stefan" and `signOut()`.

### Routing on GH Pages

**HashRouter** (URLs become `/#/sales`). Zero config, magic-link redirect parsing works (test: confirm Supabase's hash-token format coexists with HashRouter; if conflict, add a small `useEffect` that strips the auth hash before the router parses).

---

## 10. GitHub Pages Deploy

### `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/AE-Sub-Revenue-Tracker/',
});
```

### `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          VITE_OWNER_EMAIL: ${{ secrets.VITE_OWNER_EMAIL }}
          VITE_APP_BASE: /AE-Sub-Revenue-Tracker/
      - uses: actions/upload-pages-artifact@v3
        with: { path: ./dist }

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Secrets (GitHub repo → Settings → Secrets and variables → Actions)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_OWNER_EMAIL`

The anon key is *safe* to ship to the client — RLS is what protects data. Never put the service-role key in any build secret.

In repo Settings → Pages: source = "GitHub Actions."

---

## 11. Implementation Order (Milestones)

### M1 — Scaffold + Supabase + Auth (1–2 days)
- `npm create vite` → React + TS, install Tailwind, init shadcn, install supabase-js, react-router, react-query, zod, react-hook-form, date-fns, recharts, papaparse.
- Supabase project. Run migrations 0001–0004 + seed.
- `lib/supabase.ts`, `AuthProvider`, `LoginPage`, `RequireAuth`, `AppShell` skeleton with empty pages.
- Smoke test: log in with `pesut@yourbow.com`, see "Welcome." Add a non-allowlisted email → confirm rejected.

**Done when:** logged-in user sees nav with empty pages; non-allowlisted user gets bounced.

### M2 — Sales table + form (2 days)
- `data/sales.ts` queries.
- `SaleForm` with full validation, defaults, submit behavior.
- `SalesTable` with TanStack Table, filters (`SalesFilters`).
- `ActiveSubsPage` reading `v_sales_enriched` filtered by `is_active`, with `ExpirationBadge` (color thresholds: red ≤7d, amber ≤14d, green >30d).

**Done when:** Stefan can add a sale, see it in the table, see it in active subs with the right expiration date.

### M3 — CSV import (1 day)
- `CsvDropzone`, `ImportPreview`, `ImportRunner` per section 8.
- Test with the existing legacy spreadsheet exported as CSV, dates in MM/DD/YYYY.

**Done when:** historical data is loaded; running import a second time inserts zero new rows.

### M4 — Revenue dashboard (1.5 days)
- `KpiCards` calling `fn_mtd_kpis`.
- `MonthlyTrendChart` reading `v_monthly_revenue`, with gross/tax/net toggle.
- `CategoryBreakdown` for current month.

**Done when:** numbers reconcile against a hand calculation on a known sale set.

### M5 — Team allocation + payouts (2 days)
- `team_members` CRUD drawer.
- `AllocationGrid` (11 rows, % inputs, live "Operational costs" display, sum-≤-100 validation).
- Wire `fn_roll_allocations` call on app boot.
- Deploy the scheduled Edge Function (`supabase/functions/roll-allocations`) and configure cron in Supabase dashboard.
- `PayoutsPage` with `MonthPicker` calling `fn_payouts`.
- Confirm trigger blocks editing a frozen row.

**Done when:** changing %s for May updates payouts immediately; April rows refuse to update; cron job visible in Supabase.

### M6 — Deploy (0.5 day)
- Push, wire secrets, enable Pages.
- Update Supabase redirect URLs to GH Pages domain.
- Smoke test the live URL on a phone.

**Done when:** team can log in at the public URL.

**Total estimate: ~8–9 working days.**

---

## 12. Open items / future work

1. **Tax rate configurability per-sale** — current model uses a single tax rate across all Stripe sales. If specific sales need different rates, add a `tax_rate_override` column. Not adding by default.
2. **Soft-delete** — current model is hard delete. If audit trail matters later, add `deleted_at` and filter views.
3. **Refunds / chargebacks** — no model yet. For now Stefan can delete the row. If volume grows, add a `refunds` table referencing `sales`.
4. **Member removal mid-quarter** — if Stefan deactivates a member, current month's allocation row stays (so payouts still compute). Past frozen rows stay. New months won't include them.
5. **Magic-link redirect on GH Pages with HashRouter** — verify Supabase's hash-token format coexists with HashRouter during M1. If conflict, strip auth hash before router parses.

---

## Critical Files for Implementation
- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0002_views.sql`
- `supabase/migrations/0003_rpcs.sql`
- `supabase/migrations/0004_rls.sql`
- `supabase/functions/roll-allocations/index.ts`
- `src/lib/supabase.ts`
- `src/lib/format.ts` (MM/DD/YYYY rendering)
- `src/App.tsx`
- `.github/workflows/deploy.yml`
