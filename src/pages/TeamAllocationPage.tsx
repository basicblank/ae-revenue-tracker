import { Link } from 'react-router-dom';
import { AllocationGrid } from '@/components/team/AllocationGrid';

export function TeamAllocationPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">Team allocation</h1>
          <p className="text-sm text-gray-500">
            Set each teammate's % share of net revenue for the current month. Whatever's left over
            goes to operational costs. Past months are frozen and can't be changed.
          </p>
        </div>
        <Link
          to="/history"
          className="shrink-0 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          View history
        </Link>
      </div>
      <AllocationGrid />
    </div>
  );
}
