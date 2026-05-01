// Scheduled Supabase Edge Function. Runs the monthly allocation rollover on a cron schedule
// so freezing happens reliably even if no one logs in. Configure cron in the Supabase dashboard
// (Edge Functions → roll-allocations → Schedule) to run daily at 00:05 UTC.

import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    return new Response(JSON.stringify({ error: 'missing env' }), { status: 500 });
  }
  const supabase = createClient(url, key);
  const now = new Date();
  const { error } = await supabase.rpc('fn_roll_allocations', {
    p_year: now.getUTCFullYear(),
    p_month: now.getUTCMonth() + 1,
  });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }));
});
