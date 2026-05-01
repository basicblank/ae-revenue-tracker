import { useState } from 'react';
import { format } from 'date-fns';
import { useCreateMemberPayout } from '@/data/memberPayouts';
import { formatUSD } from '@/lib/format';

type Props = {
  memberId: string;
  memberName: string;
  year: number;
  month: number;
  outstandingDefault: number;
  onClose: () => void;
};

const inputClass =
  'border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500 dark:focus:border-gray-400';

export function RecordPayoutForm({
  memberId,
  memberName,
  year,
  month,
  outstandingDefault,
  onClose,
}: Props) {
  const create = useCreateMemberPayout();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [paidAt, setPaidAt] = useState(today);
  const [amount, setAmount] = useState(
    outstandingDefault > 0 ? outstandingDefault.toFixed(2) : '',
  );
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Amount must be > 0');
      return;
    }
    try {
      await create.mutateAsync({
        member_id: memberId,
        year,
        month,
        paid_at: paidAt,
        amount: n,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold">Record payment</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {memberName} — {String(month).padStart(2, '0')}/{year}
          </p>
        </div>
        <form onSubmit={onSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Date paid</label>
            <input
              type="date"
              required
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Amount (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputClass} w-full`}
            />
            {outstandingDefault > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Outstanding for this month: {formatUSD(outstandingDefault)}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. bank transfer ref, partial payment"
              className={`${inputClass} w-full`}
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded px-4 py-1.5 text-sm hover:bg-black dark:hover:bg-white disabled:opacity-50"
            >
              {create.isPending ? 'Saving...' : 'Record payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
