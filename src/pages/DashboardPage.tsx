import { KpiCards } from '@/components/dashboard/KpiCards';
import { MonthlyTrendChart } from '@/components/dashboard/MonthlyTrendChart';
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown';

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Revenue at a glance — month-to-date totals, monthly trend, and current-month split by
          category.
        </p>
      </div>
      <KpiCards />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <MonthlyTrendChart />
        </div>
        <CategoryBreakdown />
      </div>
    </div>
  );
}
