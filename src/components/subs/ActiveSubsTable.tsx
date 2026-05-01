import { useActiveSales } from '@/data/sales';
import { formatDate } from '@/lib/format';
import { ExpirationBadge } from './ExpirationBadge';
import { PLAN_LABEL } from '@/types/domain';

export function ActiveSubsTable() {
  const { data: sales = [], isLoading, error } = useActiveSales();

  if (isLoading) return <div className="text-sm text-gray-500">Loading...</div>;
  if (error)
    return <div className="text-sm text-red-600 dark:text-red-400">Error: {(error as Error).message}</div>;

  if (sales.length === 0) {
    return <div className="text-sm text-gray-500">No active subscriptions yet.</div>;
  }

  return (
    <div className="overflow-x-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Email</th>
            <th className="text-left px-3 py-2 font-medium">Plan</th>
            <th className="text-left px-3 py-2 font-medium">Category</th>
            <th className="text-left px-3 py-2 font-medium">Started</th>
            <th className="text-left px-3 py-2 font-medium">Expires</th>
            <th className="text-left px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {sales.map((s) => (
            <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="px-3 py-2">{s.email}</td>
              <td className="px-3 py-2">{PLAN_LABEL[s.plan]}</td>
              <td className="px-3 py-2 capitalize">{s.category}</td>
              <td className="px-3 py-2">{formatDate(s.transaction_date)}</td>
              <td className="px-3 py-2">{formatDate(s.expiration_date)}</td>
              <td className="px-3 py-2">
                <ExpirationBadge daysUntilExpiry={s.days_until_expiry} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
