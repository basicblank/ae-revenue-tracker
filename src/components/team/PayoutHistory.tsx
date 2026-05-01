import { useMemberPayouts, useDeleteMemberPayout } from '@/data/memberPayouts';
import { useTeamMembers } from '@/data/teamMembers';
import { formatDate, formatUSD } from '@/lib/format';
import { useAuth } from '@/auth/AuthProvider';
import { env } from '@/lib/env';

type Props = { year: number; month: number };

export function PayoutHistory({ year, month }: Props) {
  const { data: payouts = [], isLoading } = useMemberPayouts(year, month);
  const { data: members = [] } = useTeamMembers();
  const del = useDeleteMemberPayout();
  const { session } = useAuth();
  const isOwner = session?.user.email === env.ownerEmail;

  if (isLoading) return <div className="text-sm text-gray-500">Loading payment history...</div>;
  if (payouts.length === 0) return null;

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? '(removed)';

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 text-sm font-semibold">
        Payment history — {String(month).padStart(2, '0')}/{year} ({payouts.length})
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Date paid</th>
              <th className="text-left px-3 py-2 font-medium">Member</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-left px-3 py-2 font-medium">Notes</th>
              {isOwner && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {payouts.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-1.5">{formatDate(p.paid_at)}</td>
                <td className="px-3 py-1.5">{memberName(p.member_id)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatUSD(p.amount)}</td>
                <td
                  className="px-3 py-1.5 text-gray-600 dark:text-gray-400 max-w-[300px] truncate"
                  title={p.notes ?? ''}
                >
                  {p.notes}
                </td>
                {isOwner && (
                  <td className="px-3 py-1.5 text-right">
                    <button
                      onClick={() => {
                        if (confirm('Delete this payment record?')) {
                          del.mutate({ id: p.id, year, month });
                        }
                      }}
                      className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
