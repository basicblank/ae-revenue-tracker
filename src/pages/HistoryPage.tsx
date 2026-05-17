import { useMemo, useState } from 'react';
import { format, isValid } from 'date-fns';
import { useAuditLog, type AuditLogEntry, type AuditEntity } from '@/data/auditLog';
import { useTeamMembers } from '@/data/teamMembers';
import { formatUSD } from '@/lib/format';

type EntityFilter = 'all' | 'allocation' | 'team_member' | 'member_payout';

const ENTITY_LABEL: Record<Exclude<EntityFilter, 'all'>, string> = {
  allocation: 'Allocation',
  team_member: 'Team member',
  member_payout: 'Payout',
};

const ACTION_COLOR: Record<AuditLogEntry['action'], string> = {
  insert: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  update: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  delete: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function formatTs(s: string) {
  const d = new Date(s);
  if (!isValid(d)) return s;
  return format(d, 'MM/dd/yyyy HH:mm');
}

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function describe(entry: AuditLogEntry, memberName: (id: string) => string): string {
  const { entity, action, old_data, new_data } = entry;
  const row = new_data ?? old_data ?? {};

  if (entity === 'allocation') {
    const memberId = String(row.member_id ?? '');
    const name = memberName(memberId);
    const y = row.year;
    const m = row.month;
    const period = y && m ? ` (${String(m).padStart(2, '0')}/${y})` : '';
    if (action === 'insert') {
      const pct = asNumber(new_data?.pct);
      return `${name} set to ${pct ?? '?'}%${period}`;
    }
    if (action === 'delete') {
      return `${name} allocation removed${period}`;
    }
    const oldPct = asNumber(old_data?.pct);
    const newPct = asNumber(new_data?.pct);
    return `${name}: ${oldPct ?? '?'}% → ${newPct ?? '?'}%${period}`;
  }

  if (entity === 'team_member') {
    const name = String(row.name ?? '(unnamed)');
    if (action === 'insert') return `Added: ${name}`;
    if (action === 'delete') return `Deleted: ${name}`;
    const oldActive = old_data?.active;
    const newActive = new_data?.active;
    const oldName = String(old_data?.name ?? '');
    const newName = String(new_data?.name ?? '');
    if (oldActive !== newActive) {
      return newActive ? `Reactivated: ${name}` : `Removed from roster: ${name}`;
    }
    if (oldName && newName && oldName !== newName) {
      return `Renamed: ${oldName} → ${newName}`;
    }
    return `Updated: ${name}`;
  }

  if (entity === 'member_payout') {
    const memberId = String(row.member_id ?? '');
    const name = memberName(memberId);
    const amount = asNumber(row.amount) ?? 0;
    const paidAt = row.paid_at ? String(row.paid_at) : '';
    const datePart = paidAt ? ` on ${format(new Date(paidAt), 'MM/dd/yyyy')}` : '';
    if (action === 'insert') return `Paid ${formatUSD(amount)} to ${name}${datePart}`;
    if (action === 'delete') return `Deleted payout: ${formatUSD(amount)} to ${name}${datePart}`;
    return `Updated payout for ${name}`;
  }

  return `${action} on ${entity}`;
}

export function HistoryPage() {
  const [filter, setFilter] = useState<EntityFilter>('all');
  const { data: members = [] } = useTeamMembers();
  const entityArg: AuditEntity | undefined = filter === 'all' ? undefined : filter;
  const { data: entries = [], isLoading, error } = useAuditLog({ entity: entityArg, limit: 200 });

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.id, m.name);
    return (id: string) => map.get(id) ?? '(unknown member)';
  }, [members]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold mb-1">History</h1>
        <p className="text-sm text-gray-500">
          Audit trail of changes to team allocations, team members, and recorded payouts.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Filter:</span>
        {(['all', 'allocation', 'team_member', 'member_payout'] as EntityFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2.5 py-1 rounded border ${
              filter === f
                ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100'
                : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {f === 'all' ? 'All' : ENTITY_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-44">When</th>
              <th className="text-left px-3 py-2 font-medium w-56">Who</th>
              <th className="text-left px-3 py-2 font-medium w-32">Type</th>
              <th className="text-left px-3 py-2 font-medium w-24">Action</th>
              <th className="text-left px-3 py-2 font-medium">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading && (
              <tr>
                <td colSpan={5} className="text-center py-6 text-gray-500">
                  Loading...
                </td>
              </tr>
            )}
            {error && !isLoading && (
              <tr>
                <td colSpan={5} className="text-center py-6 text-red-600 dark:text-red-400">
                  {(error as Error).message}
                </td>
              </tr>
            )}
            {!isLoading && !error && entries.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-6 text-gray-500">
                  No history yet.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">
                  {formatTs(e.created_at)}
                </td>
                <td className="px-3 py-2 truncate text-gray-700 dark:text-gray-300" title={e.actor_email ?? ''}>
                  {e.actor_email ?? '—'}
                </td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                  {ENTITY_LABEL[e.entity as keyof typeof ENTITY_LABEL] ?? e.entity}
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${ACTION_COLOR[e.action]}`}>
                    {e.action}
                  </span>
                </td>
                <td className="px-3 py-2">{describe(e, memberNameById)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {entries.length >= 200 && (
        <p className="text-xs text-gray-500">Showing latest 200 entries.</p>
      )}
    </div>
  );
}
