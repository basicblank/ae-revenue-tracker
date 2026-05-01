import { useMemo } from 'react';
import { formatDate, formatUSD } from '@/lib/format';
import { PLAN_LABEL } from '@/types/domain';
import { dedupKey } from '@/lib/csvParser';
import type { ColumnMap, ParsedRow, RowError } from '@/lib/csvParser';

type Props = {
  headers: string[];
  map: ColumnMap;
  validRows: ParsedRow[];
  errors: RowError[];
  duplicateKeys: Set<string>;
};

export function ImportPreview({ headers, map, validRows, errors, duplicateKeys }: Props) {
  const dupCount = useMemo(
    () =>
      validRows.filter((r) => duplicateKeys.has(dedupKey(r.email, r.transaction_date, r.paid_amount)))
        .length,
    [validRows, duplicateKeys],
  );

  return (
    <div className="space-y-4">
      <ColumnMapPanel headers={headers} map={map} />
      <SummaryStats valid={validRows.length} errors={errors.length} duplicates={dupCount} />
      {errors.length > 0 && (
        <ErrorsTable errors={errors.slice(0, 50)} totalErrors={errors.length} />
      )}
      {validRows.length > 0 && (
        <RowsTable
          rows={validRows.slice(0, 50)}
          duplicateKeys={duplicateKeys}
          totalRows={validRows.length}
        />
      )}
    </div>
  );
}

function ColumnMapPanel({ headers, map }: { headers: string[]; map: ColumnMap }) {
  const items: { label: string; value: string | null }[] = [
    { label: 'Email', value: map.email },
    { label: 'Category', value: map.category },
    { label: 'Plan', value: map.plan },
    { label: 'Paid', value: map.paid },
    { label: 'Transaction date', value: map.transactionDate },
    { label: 'Notes', value: map.notes },
  ];
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-2">Column mapping (auto-detected)</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
        {items.map((it) => (
          <div key={it.label}>
            <span className="text-gray-500">{it.label}: </span>
            <span className={it.value ? 'font-mono text-gray-900' : 'text-red-600 italic'}>
              {it.value ?? 'not found'}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-3">
        CSV headers found: <span className="font-mono">{headers.join(', ')}</span>
      </p>
      <p className="text-xs text-gray-500 mt-1">
        Active / Expires in / Status Check are ignored — they're recomputed automatically.
      </p>
    </div>
  );
}

function SummaryStats({
  valid,
  errors,
  duplicates,
}: {
  valid: number;
  errors: number;
  duplicates: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat label="Valid rows" value={valid} tone="green" />
      <Stat label="Already in DB (will skip)" value={duplicates} tone="gray" />
      <Stat label="Invalid rows (will skip)" value={errors} tone={errors ? 'red' : 'gray'} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'green' | 'red' | 'gray';
}) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  }[tone];
  return (
    <div className={`border rounded-lg p-3 ${colors}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

function ErrorsTable({ errors, totalErrors }: { errors: RowError[]; totalErrors: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-200 text-sm font-semibold text-red-700">
        Skipped rows ({totalErrors})
        {totalErrors > errors.length && (
          <span className="text-gray-500 font-normal"> — showing first {errors.length}</span>
        )}
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Row</th>
            <th className="text-left px-3 py-2 font-medium">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {errors.map((e) => (
            <tr key={e.rowIndex}>
              <td className="px-3 py-1.5 text-gray-500">{e.rowIndex}</td>
              <td className="px-3 py-1.5 text-red-700">{e.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowsTable({
  rows,
  duplicateKeys,
  totalRows,
}: {
  rows: ParsedRow[];
  duplicateKeys: Set<string>;
  totalRows: number;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-200 text-sm font-semibold">
        Preview ({totalRows} valid rows)
        {totalRows > rows.length && (
          <span className="text-gray-500 font-normal"> — showing first {rows.length}</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Row</th>
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium">Category</th>
              <th className="text-left px-3 py-2 font-medium">Plan</th>
              <th className="text-right px-3 py-2 font-medium">Paid</th>
              <th className="text-left px-3 py-2 font-medium">Tx date</th>
              <th className="text-left px-3 py-2 font-medium">Notes</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const isDup = duplicateKeys.has(dedupKey(r.email, r.transaction_date, r.paid_amount));
              return (
                <tr key={r.rowIndex} className={isDup ? 'bg-gray-50 text-gray-500' : ''}>
                  <td className="px-3 py-1.5 text-gray-500">{r.rowIndex}</td>
                  <td className="px-3 py-1.5">{r.email}</td>
                  <td className="px-3 py-1.5 capitalize">{r.category}</td>
                  <td className="px-3 py-1.5">{PLAN_LABEL[r.plan]}</td>
                  <td className="px-3 py-1.5 text-right">{formatUSD(r.paid_amount)}</td>
                  <td className="px-3 py-1.5">{formatDate(r.transaction_date)}</td>
                  <td
                    className="px-3 py-1.5 max-w-[200px] truncate"
                    title={r.notes ?? ''}
                  >
                    {r.notes}
                  </td>
                  <td className="px-3 py-1.5">
                    {isDup ? (
                      <span className="text-xs text-gray-500">Skip (duplicate)</span>
                    ) : (
                      <span className="text-xs text-green-700">Will import</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
