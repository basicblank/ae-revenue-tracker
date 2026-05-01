import { useMtdKpis } from '@/data/revenue';
import { formatUSD } from '@/lib/format';

export function KpiCards() {
  const { data, isLoading, error } = useMtdKpis();

  if (isLoading) return <div className="text-sm text-gray-500">Loading KPIs...</div>;
  if (error)
    return <div className="text-sm text-red-600 dark:text-red-400">Error: {(error as Error).message}</div>;
  if (!data) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Kpi label="Gross MTD" value={formatUSD(data.gross_mtd)} />
      <Kpi label="Tax setaside MTD" value={formatUSD(data.tax_mtd)} />
      <Kpi label="Net MTD" value={formatUSD(data.net_mtd)} primary />
      <Kpi label="New subs MTD" value={String(data.new_subs_mtd)} />
      <Kpi label="Renewals MTD" value={String(data.renewals_mtd)} />
    </div>
  );
}

function Kpi({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <div
      className={`border rounded-lg p-3 ${
        primary
          ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100'
          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
      }`}
    >
      <div
        className={`text-xs ${primary ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500'}`}
      >
        {label}
      </div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}
