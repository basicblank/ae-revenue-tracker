import { SaleForm } from '@/components/sales/SaleForm';
import { SalesTable } from '@/components/sales/SalesTable';
import { useAuth } from '@/auth/AuthProvider';
import { env } from '@/lib/env';

export function SalesPage() {
  const { session } = useAuth();
  const isOwner = session?.user.email === env.ownerEmail;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Sales</h1>
        <p className="text-sm text-gray-500">
          {isOwner
            ? 'Record a new subscription sale, then review the history below.'
            : 'Subscription sales history.'}
        </p>
      </div>
      {isOwner && <SaleForm />}
      <SalesTable />
    </div>
  );
}
