import { usePayouts } from '@/data/allocations';
import { formatUSD } from '@/lib/format';

type Props = { year: number; month: number };

export function PayoutTable({ year, month }: Props) {
  const { data: payouts = [], isLoading, error } = usePayouts(year, month);

  if (isLoading) return <div className="text-sm text-gray-500">Loading payouts...</div>;
  if (error) return <div className="text-sm text-red-600">Error: {(error as Error).message}</div>;

  if (payouts.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500 text-center">
        No allocations set for this month yet.
      </div>
    );
  }

  const teammates = payouts.filter((p) => p.member_id !== null);
  const opsCosts = payouts.find((p) => p.member_id === null);
  const totalNet = payouts.reduce((s, p) => s + p.payout, 0);
  const totalPct = payouts.reduce((s, p) => s + p.pct, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Member</th>
            <th className="text-right px-3 py-2 font-medium">% allocation</th>
            <th className="text-right px-3 py-2 font-medium">Payout (net)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {teammates.map((p) => (
            <tr key={p.member_id ?? p.member_name}>
              <td className="px-3 py-2">{p.member_name}</td>
              <td className="px-3 py-2 text-right">{p.pct.toFixed(2)}%</td>
              <td className="px-3 py-2 text-right font-mono">{formatUSD(p.payout)}</td>
            </tr>
          ))}
          {opsCosts && (
            <tr className="bg-gray-50">
              <td className="px-3 py-2 italic text-gray-700">{opsCosts.member_name}</td>
              <td className="px-3 py-2 text-right italic">{opsCosts.pct.toFixed(2)}%</td>
              <td className="px-3 py-2 text-right italic font-mono">
                {formatUSD(opsCosts.payout)}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot className="bg-gray-100 border-t border-gray-200">
          <tr>
            <td className="px-3 py-2 font-semibold">Total</td>
            <td className="px-3 py-2 text-right font-semibold">{totalPct.toFixed(2)}%</td>
            <td className="px-3 py-2 text-right font-semibold font-mono">
              {formatUSD(totalNet)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
