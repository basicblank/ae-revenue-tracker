import { useMemo, useState } from 'react';
import {
  useTeamMembers,
  useCreateTeamMember,
  useUpdateTeamMember,
} from '@/data/teamMembers';
import { useAllocations, useUpsertAllocation } from '@/data/allocations';

const MAX_SLOTS = 11;

const inputClass =
  'border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded px-2 py-1 text-right text-sm focus:outline-none focus:border-gray-500 dark:focus:border-gray-400';

export function AllocationGrid() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data: members = [], isLoading: loadingMembers } = useTeamMembers();
  const { data: allocations = [], isLoading: loadingAllocs } = useAllocations(year, month);
  const upsert = useUpsertAllocation();
  const create = useCreateTeamMember();
  const update = useUpdateTeamMember();

  const [edits, setEdits] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeMembers = useMemo(
    () =>
      members
        .filter((m) => m.active)
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [members],
  );

  const workingValues = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of activeMembers) {
      const alloc = allocations.find((a) => a.member_id === m.id);
      map[m.id] = edits[m.id] ?? alloc?.pct ?? 0;
    }
    return map;
  }, [activeMembers, allocations, edits]);

  const sum = Object.values(workingValues).reduce((a, b) => a + b, 0);
  const opsCost = 100 - sum;
  const overflow = sum > 100 + 0.001;
  const hasChanges = Object.keys(edits).length > 0;

  const onChange = (memberId: string, value: string) => {
    if (value === '') {
      setEdits({ ...edits, [memberId]: 0 });
      return;
    }
    const n = Number(value);
    if (Number.isNaN(n)) return;
    setEdits({ ...edits, [memberId]: n });
  };

  const onSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const changes = Object.entries(edits).map(([memberId, newPct]) => {
        const oldPct = allocations.find((a) => a.member_id === memberId)?.pct ?? 0;
        return { memberId, newPct, isDecrease: newPct < oldPct };
      });
      const ordered = [
        ...changes.filter((c) => c.isDecrease),
        ...changes.filter((c) => !c.isDecrease),
      ];
      for (const c of ordered) {
        await upsert.mutateAsync({ year, month, member_id: c.memberId, pct: c.newPct });
      }
      setEdits({});
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onAdd = async () => {
    if (!newName.trim()) return;
    if (activeMembers.length >= MAX_SLOTS) return;
    try {
      await create.mutateAsync(newName.trim());
      setNewName('');
      setAdding(false);
    } catch (err) {
      setSaveError((err as Error).message);
    }
  };

  const onRemove = async (memberId: string, name: string) => {
    if (
      !confirm(
        `Remove ${name} from active roster? Their past allocations stay frozen; current month allocation will be set to 0.`,
      )
    ) {
      return;
    }
    try {
      await upsert.mutateAsync({ year, month, member_id: memberId, pct: 0 });
      await update.mutateAsync({ id: memberId, active: false });
      setEdits((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
    } catch (err) {
      setSaveError((err as Error).message);
    }
  };

  if (loadingMembers || loadingAllocs) {
    return <div className="text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Current month — {String(month).padStart(2, '0')}/{year}
          </h3>
          <span className="text-xs text-gray-500">
            {activeMembers.length} / {MAX_SLOTS} slots used
          </span>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-right px-3 py-2 font-medium">% allocation</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {activeMembers.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-6 text-gray-500">
                  No team members yet. Click "Add member" to get started.
                </td>
              </tr>
            ) : (
              activeMembers.map((m) => {
                const isEdited = edits[m.id] !== undefined;
                return (
                  <tr key={m.id} className={isEdited ? 'bg-amber-50 dark:bg-amber-900/20' : ''}>
                    <td className="px-3 py-2">{m.name}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={workingValues[m.id]}
                        onChange={(e) => onChange(m.id, e.target.value)}
                        className={`${inputClass} w-20`}
                      />
                      <span className="ml-1 text-gray-500">%</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => onRemove(m.id, m.name)}
                        className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot className="bg-gray-50 dark:bg-gray-800 text-sm">
            <tr>
              <td className="px-3 py-2 font-semibold">Allocated total</td>
              <td
                className={`px-3 py-2 text-right font-semibold ${
                  overflow ? 'text-red-600 dark:text-red-400' : ''
                }`}
              >
                {sum.toFixed(2)}%
              </td>
              <td></td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-semibold">Operational costs</td>
              <td
                className={`px-3 py-2 text-right font-semibold ${
                  overflow ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {opsCost.toFixed(2)}%
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {!adding && activeMembers.length < MAX_SLOTS && (
          <button
            onClick={() => setAdding(true)}
            className="border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            + Add member
          </button>
        )}
        {adding && (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onAdd();
                if (e.key === 'Escape') {
                  setAdding(false);
                  setNewName('');
                }
              }}
              placeholder="Member name"
              className={`${inputClass} text-left`}
            />
            <button
              onClick={onAdd}
              disabled={!newName.trim() || create.isPending}
              className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded px-3 py-1.5 text-sm hover:bg-black dark:hover:bg-white disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewName('');
              }}
              className="text-sm text-gray-500"
            >
              Cancel
            </button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          {overflow && (
            <span className="text-xs text-red-600 dark:text-red-400">
              Total exceeds 100% — fix before saving.
            </span>
          )}
          <button
            onClick={onSave}
            disabled={!hasChanges || overflow || saving}
            className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded px-4 py-1.5 text-sm hover:bg-black dark:hover:bg-white disabled:opacity-50"
          >
            {saving
              ? 'Saving...'
              : `Save changes${hasChanges ? ` (${Object.keys(edits).length})` : ''}`}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-400">
          {saveError}
        </div>
      )}
    </div>
  );
}
