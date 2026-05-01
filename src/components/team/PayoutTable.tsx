import { useMemo, useState } from 'react';
import { usePayouts } from '@/data/allocations';
import { useMemberPayouts } from '@/data/memberPayouts';
import { formatUSD } from '@/lib/format';
import { useAuth } from '@/auth/AuthProvider';
import { env } from '@/lib/env';
import { RecordPayoutForm } from './RecordPayoutForm';

type Props = { year: number; month: number };

export function PayoutTable({ year, month }: Props) {
  const { data: payouts = [], isLoading, error } = usePayouts(year, month);
  const { data: payments = [] } = useMemberPayouts(year, month);
  const { session } = useAuth();
  const isOwner = session?.user.email === env.ownerEmail;

  const [recordingFor, setRecordingFor] = useState<{
    memberId: string;
    memberName: string;
    outstanding: number;
  } | null>(null);

  const paidByMember = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      map.set(p.member_id, (map.get(p.member_id) ?? 0) + p.amount);
    }
    return map;
  }, [payments]);

  if (isLoading) return <div className="text-sm text-gray-500">Loading payouts...</div>;
  if (error)
    return <div className="text-sm text-red-600 dark:text-red-400">Error: {(error as Error).message}</div>;

  if (payouts.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 text-sm text-gray-500 text-center">
        No allocations set for this month yet.
      </div>
    );
  }

  const teammates = payouts.filter((p) => p.member_id !== null);
  const opsCosts = payouts.find((p) => p.member_id === null);
  const totalCut = payouts.reduce((s, p) => s + p.payout, 0);
  const totalPaid = Array.from(paidByMember.values()).reduce((s, v) => s + v, 0);
  const totalPct = payouts.reduce((s, p) => s + p.pct, 0);

  return (
    <>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Member</th>
                <th className="text-right px-3 py-2 font-medium">% allocation</th>
                <th className="text-right px-3 py-2 font-medium">Cut</th>
                <th className="text-right px-3 py-2 font-medium">Paid</th>
                <th className="text-right px-3 py-2 font-medium">Outstanding</th>
                {isOwner && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {teammates.map((p) => {
                const paid = p.member_id ? (paidByMember.get(p.member_id) ?? 0) : 0;
                const outstanding = p.payout - paid;
                const isOver = paid > p.payout + 0.001;
                return (
                  <tr key={p.member_id ?? p.member_name}>
                    <td className="px-3 py-2">{p.member_name}</td>
                    <td className="px-3 py-2 text-right">{p.pct.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-mono">{formatUSD(p.payout)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {paid > 0 ? formatUSD(paid) : <span className="text-gray-400">—</span>}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${
                        isOver
                          ? 'text-amber-700 dark:text-amber-400'
                          : outstanding < 0.01
                            ? 'text-green-700 dark:text-green-400'
                            : ''
                      }`}
                    >
                      {isOver
                        ? `+${formatUSD(Math.abs(outstanding))} over`
                        : outstanding < 0.01
                          ? 'Paid'
                          : formatUSD(outstanding)}
                    </td>
                    {isOwner && (
                      <td className="px-3 py-2 text-right">
                        {p.member_id && (
                          <button
                            onClick={() =>
                              setRecordingFor({
                                memberId: p.member_id!,
                                memberName: p.member_name,
                                outstanding: Math.max(0, outstanding),
                              })
                            }
                            className="text-xs text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-700 rounded px-2 py-0.5"
                          >
                            + Record
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {opsCosts && (
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <td className="px-3 py-2 italic text-gray-700 dark:text-gray-300">
                    {opsCosts.member_name}
                  </td>
                  <td className="px-3 py-2 text-right italic">{opsCosts.pct.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right italic font-mono">
                    {formatUSD(opsCosts.payout)}
                  </td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
                  {isOwner && <td className="px-3 py-2"></td>}
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <tr>
                <td className="px-3 py-2 font-semibold">Total</td>
                <td className="px-3 py-2 text-right font-semibold">{totalPct.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right font-semibold font-mono">{formatUSD(totalCut)}</td>
                <td className="px-3 py-2 text-right font-semibold font-mono">{formatUSD(totalPaid)}</td>
                <td className="px-3 py-2 text-right font-semibold font-mono">
                  {formatUSD(Math.max(0, totalCut - totalPaid))}
                </td>
                {isOwner && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {recordingFor && (
        <RecordPayoutForm
          memberId={recordingFor.memberId}
          memberName={recordingFor.memberName}
          year={year}
          month={month}
          outstandingDefault={recordingFor.outstanding}
          onClose={() => setRecordingFor(null)}
        />
      )}
    </>
  );
}
