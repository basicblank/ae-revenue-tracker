import { formatDate } from '@/lib/format';
import { useRunStripeSync, useStripeSyncState } from '@/data/stripeSync';
import type { SyncResult } from '@/data/stripeSync';

export function StripeSyncPanel() {
  const state = useStripeSyncState();
  const run = useRunStripeSync();

  const lastSync = state.data?.last_sync_at;
  const lastStatus = state.data?.last_sync_status;
  const lastResult = state.data?.last_sync_result;
  const isError = lastStatus?.startsWith('error:');

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Stripe sync</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Pulls successful Stripe charges from the crypto-dashboard. Runs on a daily cron;
            use the button for an on-demand pull.
          </p>
        </div>
        <button
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded px-3 py-1.5 text-sm hover:bg-black dark:hover:bg-white disabled:opacity-50 whitespace-nowrap"
        >
          {run.isPending ? 'Syncing...' : 'Sync now'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Stat label="Last sync" value={lastSync ? formatDateTime(lastSync) : '—'} />
        <Stat
          label="Status"
          value={lastStatus ?? '—'}
          tone={isError ? 'error' : lastStatus === 'success' ? 'success' : 'neutral'}
        />
        <Stat
          label="Cursor (paid_at)"
          value={state.data?.latest_paid_at ? formatDateTime(state.data.latest_paid_at) : '—'}
        />
        <Stat
          label="Cursor (invoice)"
          value={state.data?.latest_invoice_id ?? '—'}
          mono
        />
      </div>

      {lastResult && !run.isPending && <ResultBlock result={lastResult} />}

      {run.isError && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
          {(run.error as Error).message}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'neutral',
  mono = false,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'error';
  mono?: boolean;
}) {
  const toneClass =
    tone === 'success'
      ? 'text-green-700 dark:text-green-400'
      : tone === 'error'
        ? 'text-red-700 dark:text-red-400'
        : 'text-gray-900 dark:text-gray-100';
  return (
    <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5">
      <div className="text-[10px] uppercase text-gray-500 dark:text-gray-400 tracking-wide">
        {label}
      </div>
      <div
        className={`${toneClass} ${mono ? 'font-mono text-[11px]' : ''} truncate`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function ResultBlock({ result }: { result: SyncResult }) {
  const skipTotal =
    result.skipped.non_usd +
    result.skipped.unmappable_amount +
    result.skipped.usd_but_amount_null +
    result.skipped.collision_different_invoice;
  const hasUnmappable = result.skipped.unmappable_amount > 0;

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded p-2 text-xs space-y-1">
      <div className="font-medium text-gray-700 dark:text-gray-300">Last run</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-gray-700 dark:text-gray-300">
        <div>Fetched: <strong>{result.fetched}</strong></div>
        <div>Inserted: <strong className="text-green-700 dark:text-green-400">{result.inserted}</strong></div>
        <div>Reconciled: <strong>{result.reconciled}</strong></div>
        <div>Already synced: <strong>{result.skipped_already_synced}</strong></div>
        <div>Skipped: <strong>{skipTotal}</strong></div>
      </div>
      {hasUnmappable && result.unmappable_samples.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2 mt-2">
          <div className="font-medium text-amber-800 dark:text-amber-300 mb-1">
            {result.skipped.unmappable_amount} row(s) had unrecognized amounts and were skipped:
          </div>
          <ul className="font-mono text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
            {result.unmappable_samples.map((s) => (
              <li key={s.invoice}>
                {s.invoice} — ${(s.amount / 100).toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${formatDate(d)} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}
