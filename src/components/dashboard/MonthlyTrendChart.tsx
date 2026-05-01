import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { useMonthlyRevenue } from '@/data/revenue';
import { formatUSD } from '@/lib/format';
import { useTheme } from '@/lib/theme';

type Metric = 'gross' | 'tax' | 'net';

const METRIC_LABEL: Record<Metric, string> = {
  gross: 'Gross',
  tax: 'Tax setaside',
  net: 'Net',
};

export function MonthlyTrendChart() {
  const { data: rows = [], isLoading, error } = useMonthlyRevenue();
  const [metric, setMetric] = useState<Metric>('net');
  const { theme } = useTheme();

  const chartData = useMemo(() => {
    const map = new Map<string, { month: string; label: string; stripe: number; nowpayments: number }>();
    for (const r of rows) {
      if (!map.has(r.month_start)) {
        map.set(r.month_start, {
          month: r.month_start,
          label: format(parseISO(r.month_start), 'MMM yyyy'),
          stripe: 0,
          nowpayments: 0,
        });
      }
      map.get(r.month_start)![r.category] = r[metric];
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [rows, metric]);

  if (isLoading) return <div className="text-sm text-gray-500">Loading chart...</div>;
  if (error)
    return <div className="text-sm text-red-600 dark:text-red-400">Error: {(error as Error).message}</div>;

  if (chartData.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 text-sm text-gray-500 text-center">
        No revenue data yet. Add a sale or import historical data.
      </div>
    );
  }

  const isDark = theme === 'dark';
  const gridColor = isDark ? '#374151' : '#e5e7eb';
  const tickColor = isDark ? '#9ca3af' : '#6b7280';
  const tooltipBg = isDark ? '#1f2937' : '#ffffff';
  const tooltipBorder = isDark ? '#374151' : '#e5e7eb';
  const cursorFill = isDark ? '#1f2937' : '#f3f4f6';

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold">Monthly revenue</h3>
        <div className="flex gap-1 text-xs">
          {(['gross', 'tax', 'net'] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-2 py-1 rounded ${
                metric === m
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickColor }} stroke={gridColor} />
          <YAxis
            tick={{ fontSize: 12, fill: tickColor }}
            stroke={gridColor}
            tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`)}
          />
          <Tooltip
            formatter={(v: number) => formatUSD(v)}
            cursor={{ fill: cursorFill }}
            contentStyle={{
              backgroundColor: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: tickColor }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: tickColor }} />
          <Bar dataKey="stripe" stackId="rev" fill="#635bff" name="Stripe" />
          <Bar dataKey="nowpayments" stackId="rev" fill="#22c55e" name="NowPayments" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
