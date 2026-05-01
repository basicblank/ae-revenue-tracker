import { useMemo, useState } from 'react';
import { useSales, useDeleteSale } from '@/data/sales';
import { formatDate, formatUSD } from '@/lib/format';
import { useAuth } from '@/auth/AuthProvider';
import { env } from '@/lib/env';
import type { SaleCategory, SalePlan } from '@/types/domain';
import { PLAN_LABEL } from '@/types/domain';

type StatusFilter = 'all' | 'active' | 'expired';

const inputClass =
  'border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500 dark:focus:border-gray-400';

export function SalesTable() {
  const { data: sales = [], isLoading, error } = useSales();
  const deleteMut = useDeleteSale();
  const { session } = useAuth();
  const isOwner = session?.user.email === env.ownerEmail;

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | SaleCategory>('all');
  const [plan, setPlan] = useState<'all' | SalePlan>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      if (search && !s.email.toLowerCase().includes(search.toLowerCase())) return false;
      if (category !== 'all' && s.category !== category) return false;
      if (plan !== 'all' && s.plan !== plan) return false;
      if (status === 'active' && !s.is_active) return false;
      if (status === 'expired' && s.is_active) return false;
      return true;
    });
  }, [sales, search, category, plan, status]);

  if (isLoading) return <div className="text-sm text-gray-500">Loading sales...</div>;
  if (error)
    return <div className="text-sm text-red-600 dark:text-red-400">Error: {(error as Error).message}</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email..."
          className={inputClass}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as 'all' | SaleCategory)}
          className={inputClass}
        >
          <option value="all">All categories</option>
          <option value="stripe">Stripe</option>
          <option value="nowpayments">NowPayments</option>
        </select>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as 'all' | SalePlan)}
          className={inputClass}
        >
          <option value="all">All plans</option>
          <option value="1m">1 month</option>
          <option value="3m">3 months</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className={inputClass}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
        </select>
        <span className="text-xs text-gray-500 ml-auto">
          {filtered.length} of {sales.length}
        </span>
      </div>
      <div className="overflow-x-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium">Category</th>
              <th className="text-left px-3 py-2 font-medium">Plan</th>
              <th className="text-right px-3 py-2 font-medium">Paid</th>
              <th className="text-right px-3 py-2 font-medium">Net</th>
              <th className="text-right px-3 py-2 font-medium">Tax setaside</th>
              <th className="text-left px-3 py-2 font-medium">Tx date</th>
              <th className="text-left px-3 py-2 font-medium">Expires</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Notes</th>
              {isOwner && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isOwner ? 11 : 10} className="text-center py-6 text-gray-500">
                  No sales found.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-3 py-2">{s.email}</td>
                  <td className="px-3 py-2 capitalize">{s.category}</td>
                  <td className="px-3 py-2">{PLAN_LABEL[s.plan]}</td>
                  <td className="px-3 py-2 text-right">{formatUSD(s.paid_amount)}</td>
                  <td className="px-3 py-2 text-right">{formatUSD(s.net_amount)}</td>
                  <td className="px-3 py-2 text-right">{formatUSD(s.tax_setaside)}</td>
                  <td className="px-3 py-2">{formatDate(s.transaction_date)}</td>
                  <td className="px-3 py-2">{formatDate(s.expiration_date)}</td>
                  <td className="px-3 py-2">
                    {s.is_active ? (
                      <span className="text-green-700 dark:text-green-400">
                        Active ({s.days_until_expiry}d)
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">Expired</span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[200px] truncate"
                    title={s.notes ?? ''}
                  >
                    {s.notes}
                  </td>
                  {isOwner && (
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`Delete sale for ${s.email}?`)) deleteMut.mutate(s.id);
                        }}
                        className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
