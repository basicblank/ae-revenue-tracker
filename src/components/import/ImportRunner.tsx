import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { invalidateSalesData } from '@/lib/queryClient';
import { dedupKey } from '@/lib/csvParser';
import type { ParsedRow } from '@/lib/csvParser';

export type ImportReport = {
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
};

type Props = {
  rows: ParsedRow[];
  duplicateKeys: Set<string>;
  onDone: (report: ImportReport) => void;
};

const BATCH_SIZE = 500;

export function ImportRunner({ rows, duplicateKeys, onDone }: Props) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const toInsert = rows.filter(
    (r) => !duplicateKeys.has(dedupKey(r.email, r.transaction_date, r.paid_amount)),
  );

  const run = async () => {
    setRunning(true);
    setProgress(0);
    let inserted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const payload = batch.map((r) => ({
        email: r.email,
        category: r.category,
        plan: r.plan,
        paid_amount: r.paid_amount,
        transaction_date: r.transaction_date,
        notes: r.notes,
      }));
      const { data, error } = await supabase
        .from('sales')
        .upsert(payload, {
          onConflict: 'email,transaction_date,paid_amount',
          ignoreDuplicates: true,
        })
        .select('id');
      if (error) {
        failed += batch.length;
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        inserted += data?.length ?? 0;
      }
      setProgress(Math.min(i + batch.length, toInsert.length));
    }

    invalidateSalesData(qc);
    setRunning(false);
    onDone({
      inserted,
      skipped: rows.length - inserted - failed,
      failed,
      errors,
    });
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 space-y-3">
      <div className="text-sm">
        Ready to import <strong>{toInsert.length}</strong> new row
        {toInsert.length === 1 ? '' : 's'}.
        {duplicateKeys.size > 0 && rows.length - toInsert.length > 0 && (
          <span className="text-gray-500">
            {' '}
            {rows.length - toInsert.length} will be skipped as duplicates.
          </span>
        )}
      </div>
      {running && (
        <div>
          <div className="bg-gray-200 dark:bg-gray-800 rounded h-2 overflow-hidden">
            <div
              className="bg-gray-900 dark:bg-gray-100 h-full transition-all"
              style={{
                width: toInsert.length === 0 ? '0%' : `${(progress / toInsert.length) * 100}%`,
              }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {progress} / {toInsert.length}
          </div>
        </div>
      )}
      <button
        onClick={run}
        disabled={running || toInsert.length === 0}
        className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded px-4 py-1.5 text-sm hover:bg-black dark:hover:bg-white disabled:opacity-50"
      >
        {running ? 'Importing...' : `Import ${toInsert.length} row${toInsert.length === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}
