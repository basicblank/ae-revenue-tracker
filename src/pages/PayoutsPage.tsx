import { useState } from 'react';
import { MonthPicker } from '@/components/team/MonthPicker';
import { PayoutTable } from '@/components/team/PayoutTable';
import { PayoutHistory } from '@/components/team/PayoutHistory';

export function PayoutsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold mb-1">Payouts</h1>
        <p className="text-sm text-gray-500">
          Each member's share of net revenue based on their allocation for the chosen month, plus
          what's been paid out and what's still owed.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700 dark:text-gray-300">Month:</span>
        <MonthPicker
          year={year}
          month={month}
          onChange={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
      </div>
      <PayoutTable year={year} month={month} />
      <PayoutHistory year={year} month={month} />
    </div>
  );
}
