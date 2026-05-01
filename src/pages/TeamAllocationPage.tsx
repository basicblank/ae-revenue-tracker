import { AllocationGrid } from '@/components/team/AllocationGrid';
import { useAuth } from '@/auth/AuthProvider';
import { env } from '@/lib/env';

export function TeamAllocationPage() {
  const { session } = useAuth();
  const isOwner = session?.user.email === env.ownerEmail;

  if (!isOwner) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Team allocation</h1>
        <p className="text-sm text-gray-500">Only the owner can edit team allocations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold mb-1">Team allocation</h1>
        <p className="text-sm text-gray-500">
          Set each teammate's % share of net revenue for the current month. Whatever's left over
          goes to operational costs. Past months are frozen and can't be changed.
        </p>
      </div>
      <AllocationGrid />
    </div>
  );
}
