import { useMemo } from 'react';
import { useMonthlyRevenue } from '@/data/revenue';
import { formatUSD } from '@/lib/format';

export function CategoryBreakdown() {
  const { data: rows = [], isLoading } = useMonthlyRevenue();

  const current = useMemo(() => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const stripe = rows.find((r) => r.month_start === monthStart && r.category === 'stripe');
    const nowp = rows.find((r) => r.month_start === monthStart && r.category === 'nowpayments');
    return {
      stripe: stripe?.net ?? 0,
      nowpayments: nowp?.net ?? 0,
      stripeCount: stripe?.sale_count ?? 0,
      nowpaymentsCount: nowp?.sale_count ?? 0,
    };
  }, [rows]);

  if (isLoading) return null;

  const total = current.stripe + current.nowpayments;
  const stripePct = total > 0 ? (current.stripe / total) * 100 : 0;
  const nowpPct = total > 0 ? (current.nowpayments / total) * 100 : 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Current month — net by category</h3>
      <div className="space-y-3">
        <Row
          label="Stripe"
          amount={current.stripe}
          count={current.stripeCount}
          pct={stripePct}
          color="bg-indigo-500"
        />
        <Row
          label="NowPayments"
          amount={current.nowpayments}
          count={current.nowpaymentsCount}
          pct={nowpPct}
          color="bg-green-500"
        />
        {total > 0 ? (
          <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100 dark:border-gray-800">
            <span className="font-semibold">Total</span>
            <span className="font-semibold">{formatUSD(total)}</span>
          </div>
        ) : (
          <div className="text-sm text-gray-500 text-center py-2">No sales this month yet.</div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  amount,
  count,
  pct,
  color,
}: {
  label: string;
  amount: number;
  count: number;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        <span className="font-mono">
          {formatUSD(amount)}{' '}
          <span className="text-gray-400 dark:text-gray-500 text-xs">
            ({count} {count === 1 ? 'sale' : 'sales'})
          </span>
        </span>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 h-2 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
