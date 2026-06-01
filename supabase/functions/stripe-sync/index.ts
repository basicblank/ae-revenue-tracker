// Scheduled + on-demand Stripe revenue sync. Pulls successful Stripe charges from the
// crypto-dashboard's read-only revenue API and upserts them into public.sales.
//
// Invocation:
//   - Scheduled (cron) via Supabase dashboard, called with the service-role key.
//   - Manual via the Import page's "Sync now" button, called with the owner's JWT.
//
// Required env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (auto-populated)
//   CRYPTO_DASHBOARD_API_KEY (set via `supabase secrets set CRYPTO_DASHBOARD_API_KEY=cdk_live_...`)

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const API_BASE = 'https://alphaextract.xyz/api/v1';
const SYNC_KEY = 'stripe_revenue';
const PAGE_LIMIT = 1000;

const AMOUNT_TO_PLAN: Record<number, '1m' | '3m'> = {
  3900: '1m',
  7000: '3m',
};

// One-off invoice → plan overrides for charges that don't match the standard prices.
// Kept here (not in a DB table) because the list is small and the audit trail matters.
const INVOICE_PLAN_OVERRIDES: Record<string, '1m' | '3m'> = {
  // VAT-inclusive $87.50 charge from a since-fixed pricing bug; treated as 3m ($70).
  'in_1SlHpzKUJiSs6SkzoN9T3jyl': '3m',
};

type RevenueRow = {
  stripe_invoice_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  user_id: string | null;
  email: string;
  provider: string;
  amount_minor: number;
  amount_usd: number | null;
  currency: string;
  paid_at: string;
  plan_interval: string | null;
};

type RevenueResponse = {
  data: RevenueRow[];
  meta: {
    count: number;
    limit: number;
    has_more: boolean;
    latest_paid_at?: string;
    latest_invoice_id?: string;
  };
};

type SaleInsert = {
  email: string;
  category: 'stripe';
  plan: '1m' | '3m';
  paid_amount: number;
  transaction_date: string;
  source: 'stripe_sync';
  stripe_invoice_id: string;
  stripe_subscription_id: string;
};

type SkipReason =
  | 'non_usd'
  | 'unmappable_amount'
  | 'usd_but_amount_null'
  | 'collision_different_invoice';

type Counters = {
  fetched: number;
  inserted: number;
  reconciled: number;
  skipped_already_synced: number;
  skipped: Record<SkipReason, number>;
  unmappable_samples: { invoice: string; amount: number }[];
  pages: number;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const apiKey = Deno.env.get('CRYPTO_DASHBOARD_API_KEY');

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ error: 'missing_supabase_env' }, 500);
    }
    if (!apiKey) {
      return json({ error: 'missing CRYPTO_DASHBOARD_API_KEY' }, 500);
    }

    const auth = await authorize(req, supabaseUrl, anonKey, serviceKey);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: cursorRow, error: cursorErr } = await supabase
      .from('sync_state')
      .select('latest_paid_at, latest_invoice_id')
      .eq('key', SYNC_KEY)
      .single();
    if (cursorErr) {
      return json({ error: 'cursor_read_failed', detail: cursorErr.message }, 500);
    }

    let since: string = cursorRow?.latest_paid_at ?? '1970-01-01T00:00:00Z';
    let afterInvoiceId: string = cursorRow?.latest_invoice_id ?? '';

    const counters: Counters = {
      fetched: 0,
      inserted: 0,
      reconciled: 0,
      skipped_already_synced: 0,
      skipped: {
        non_usd: 0,
        unmappable_amount: 0,
        usd_but_amount_null: 0,
        collision_different_invoice: 0,
      },
      unmappable_samples: [],
      pages: 0,
    };

    while (true) {
      counters.pages++;
      const url = new URL(`${API_BASE}/revenue/payments`);
      url.searchParams.set('since', since);
      url.searchParams.set('limit', String(PAGE_LIMIT));
      if (afterInvoiceId) url.searchParams.set('after_invoice_id', afterInvoiceId);

      const resp = await fetchWithRetry(url.toString(), apiKey);
      if (!resp.ok) {
        const body = await resp.text();
        await markFailure(supabase, `upstream_${resp.status}: ${body.slice(0, 300)}`);
        return json({ error: 'upstream_failed', status: resp.status, body }, 502);
      }

      const payload = (await resp.json()) as RevenueResponse;
      counters.fetched += payload.data.length;

      const batchResult = await processBatch(supabase, payload.data, counters);
      if (!batchResult.ok) {
        await markFailure(supabase, batchResult.error);
        return json({ error: 'batch_process_failed', detail: batchResult.error }, 500);
      }

      if (payload.meta.latest_paid_at && payload.meta.latest_invoice_id) {
        since = payload.meta.latest_paid_at;
        afterInvoiceId = payload.meta.latest_invoice_id;
        await supabase
          .from('sync_state')
          .update({
            latest_paid_at: since,
            latest_invoice_id: afterInvoiceId,
            updated_at: new Date().toISOString(),
          })
          .eq('key', SYNC_KEY);
      }

      if (!payload.meta.has_more) break;
    }

    await supabase
      .from('sync_state')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_sync_result: counters,
        updated_at: new Date().toISOString(),
      })
      .eq('key', SYNC_KEY);

    return json({ ok: true, ...counters }, 200);
  } catch (e) {
    return json({ error: 'unexpected', detail: String(e) }, 500);
  }
});

async function authorize(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  serviceKey: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { ok: false, error: 'missing_auth', status: 401 };
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (token === serviceKey) return { ok: true };

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false, error: 'unauthorized', status: 401 };

  const { data: isOwner, error: ownerErr } = await userClient.rpc('is_owner');
  if (ownerErr || !isOwner) return { ok: false, error: 'forbidden', status: 403 };

  return { ok: true };
}

async function fetchWithRetry(url: string, apiKey: string): Promise<Response> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (resp.status < 500) return resp;
    await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
  }
  return fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
}

async function processBatch(
  supabase: SupabaseClient,
  rows: RevenueRow[],
  counters: Counters,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (rows.length === 0) return { ok: true };

  const mappable: SaleInsert[] = [];
  for (const row of rows) {
    if (row.currency !== 'usd') {
      counters.skipped.non_usd++;
      continue;
    }
    const plan =
      INVOICE_PLAN_OVERRIDES[row.stripe_invoice_id] ?? AMOUNT_TO_PLAN[row.amount_minor];
    if (!plan) {
      counters.skipped.unmappable_amount++;
      if (counters.unmappable_samples.length < 10) {
        counters.unmappable_samples.push({
          invoice: row.stripe_invoice_id,
          amount: row.amount_minor,
        });
      }
      continue;
    }
    if (row.amount_usd === null) {
      counters.skipped.usd_but_amount_null++;
      continue;
    }
    mappable.push({
      email: row.email,
      category: 'stripe',
      plan,
      paid_amount: row.amount_usd,
      transaction_date: row.paid_at.slice(0, 10),
      source: 'stripe_sync',
      stripe_invoice_id: row.stripe_invoice_id,
      stripe_subscription_id: row.stripe_subscription_id,
    });
  }

  if (mappable.length === 0) return { ok: true };

  const invoiceIds = mappable.map((m) => m.stripe_invoice_id);
  const txnDates = Array.from(new Set(mappable.map((m) => m.transaction_date)));

  const { data: byInvoice, error: e1 } = await supabase
    .from('sales')
    .select('id, stripe_invoice_id')
    .in('stripe_invoice_id', invoiceIds);
  if (e1) return { ok: false, error: `lookup_invoice: ${e1.message}` };

  const { data: byDate, error: e2 } = await supabase
    .from('sales')
    .select('id, email, transaction_date, paid_amount, stripe_invoice_id')
    .in('transaction_date', txnDates);
  if (e2) return { ok: false, error: `lookup_date: ${e2.message}` };

  const seenInvoices = new Set<string>();
  for (const r of byInvoice ?? []) {
    if (r.stripe_invoice_id) seenInvoices.add(r.stripe_invoice_id);
  }

  const txnIndex = new Map<string, { id: string; stripe_invoice_id: string | null }>();
  for (const r of byDate ?? []) {
    const key = txnKey(r.email, r.transaction_date, Number(r.paid_amount));
    txnIndex.set(key, { id: r.id, stripe_invoice_id: r.stripe_invoice_id });
  }

  const toInsert: SaleInsert[] = [];
  const toReconcile: {
    id: string;
    stripe_invoice_id: string;
    stripe_subscription_id: string;
  }[] = [];

  for (const m of mappable) {
    if (seenInvoices.has(m.stripe_invoice_id)) {
      counters.skipped_already_synced++;
      continue;
    }
    const existing = txnIndex.get(txnKey(m.email, m.transaction_date, m.paid_amount));
    if (existing) {
      if (
        existing.stripe_invoice_id &&
        existing.stripe_invoice_id !== m.stripe_invoice_id
      ) {
        counters.skipped.collision_different_invoice++;
        continue;
      }
      toReconcile.push({
        id: existing.id,
        stripe_invoice_id: m.stripe_invoice_id,
        stripe_subscription_id: m.stripe_subscription_id,
      });
      continue;
    }
    toInsert.push(m);
  }

  for (const r of toReconcile) {
    const { error } = await supabase
      .from('sales')
      .update({
        stripe_invoice_id: r.stripe_invoice_id,
        stripe_subscription_id: r.stripe_subscription_id,
        source: 'stripe_sync',
      })
      .eq('id', r.id);
    if (error) return { ok: false, error: `reconcile: ${error.message}` };
    counters.reconciled++;
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('sales').insert(toInsert);
    if (error) return { ok: false, error: `insert: ${error.message}` };
    counters.inserted += toInsert.length;
  }

  return { ok: true };
}

function txnKey(email: string, transactionDate: string, paidAmount: number): string {
  return `${email.toLowerCase()}|${transactionDate}|${paidAmount.toFixed(2)}`;
}

async function markFailure(supabase: SupabaseClient, reason: string) {
  await supabase
    .from('sync_state')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: `error: ${reason.slice(0, 500)}`,
      updated_at: new Date().toISOString(),
    })
    .eq('key', SYNC_KEY);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
