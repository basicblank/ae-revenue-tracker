import { ActiveSubsTable } from '@/components/subs/ActiveSubsTable';

export function ActiveSubsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold mb-1">Active subscriptions</h1>
        <p className="text-sm text-gray-500">
          Subscriptions that haven't expired yet, sorted by upcoming expiration.
        </p>
      </div>
      <ActiveSubsTable />
    </div>
  );
}
