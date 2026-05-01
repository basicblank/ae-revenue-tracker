import { useEffect, useMemo, useState } from 'react';
import { CsvDropzone } from '@/components/import/CsvDropzone';
import { ImportPreview } from '@/components/import/ImportPreview';
import { ImportRunner } from '@/components/import/ImportRunner';
import type { ImportReport } from '@/components/import/ImportRunner';
import { autoMapColumns, parseRows, validateColumnMap, dedupKey } from '@/lib/csvParser';
import type { ColumnMap, ParsedRow, RowError } from '@/lib/csvParser';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { env } from '@/lib/env';

export function ImportPage() {
  const { session } = useAuth();
  const isOwner = session?.user.email === env.ownerEmail;

  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [validRows, setValidRows] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [duplicateKeys, setDuplicateKeys] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<ImportReport | null>(null);
  const [loadingDup, setLoadingDup] = useState(false);

  const onParsed = (f: File, hdrs: string[], rows: Record<string, string>[]) => {
    const m = autoMapColumns(hdrs);
    const { valid, errors: errs } = parseRows(rows, m);
    setFile(f);
    setHeaders(hdrs);
    setRawRows(rows);
    setMap(m);
    setValidRows(valid);
    setErrors(errs);
    setReport(null);
  };

  useEffect(() => {
    if (validRows.length === 0) {
      setDuplicateKeys(new Set());
      return;
    }
    setLoadingDup(true);
    const dates = Array.from(new Set(validRows.map((r) => r.transaction_date)));
    let cancelled = false;
    supabase
      .from('sales')
      .select('email,transaction_date,paid_amount')
      .in('transaction_date', dates)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setDuplicateKeys(new Set());
        } else {
          const keys = new Set(
            (data ?? []).map((d) => dedupKey(d.email, d.transaction_date, Number(d.paid_amount))),
          );
          setDuplicateKeys(keys);
        }
        setLoadingDup(false);
      });
    return () => {
      cancelled = true;
    };
  }, [validRows]);

  const mapValid = useMemo(
    () => (map ? validateColumnMap(map) : { ok: false, missing: [] }),
    [map],
  );

  const reset = () => {
    setFile(null);
    setHeaders([]);
    setRawRows([]);
    setMap(null);
    setValidRows([]);
    setErrors([]);
    setDuplicateKeys(new Set());
    setReport(null);
  };

  if (!isOwner) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Import</h1>
        <p className="text-sm text-gray-500">CSV import is only available to the owner.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold mb-1">Import</h1>
        <p className="text-sm text-gray-500">
          Bulk-load historical sales from CSV. Dates must be MM/DD/YYYY. Active / Expires in / Status
          Check columns are ignored — they're recomputed.
        </p>
      </div>

      {!file && <CsvDropzone onParsed={onParsed} />}

      {file && map && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-sm">
              Loaded <strong>{file.name}</strong> ({rawRows.length} row
              {rawRows.length === 1 ? '' : 's'})
            </div>
            <button
              onClick={reset}
              className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline"
            >
              Choose a different file
            </button>
          </div>
          {!mapValid.ok && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-400">
              <div className="font-semibold mb-1">
                Could not auto-detect required column(s): {mapValid.missing.join(', ')}.
              </div>
              <div>
                CSV headers found: <span className="font-mono">{headers.join(', ')}</span>
              </div>
              <div className="mt-1">Rename the column in your CSV and re-upload.</div>
            </div>
          )}
          <ImportPreview
            headers={headers}
            map={map}
            validRows={validRows}
            errors={errors}
            duplicateKeys={duplicateKeys}
          />
          {loadingDup && (
            <div className="text-xs text-gray-500">Checking for existing duplicates...</div>
          )}
          {mapValid.ok && validRows.length > 0 && !report && !loadingDup && (
            <ImportRunner rows={validRows} duplicateKeys={duplicateKeys} onDone={setReport} />
          )}
          {report && <ReportPanel report={report} onReset={reset} />}
        </>
      )}
    </div>
  );
}

function ReportPanel({ report, onReset }: { report: ImportReport; onReset: () => void }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold">Import complete</h3>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3">
          <div className="text-2xl font-bold text-green-700 dark:text-green-400">{report.inserted}</div>
          <div className="text-xs text-green-700 dark:text-green-400">Inserted</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
          <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">{report.skipped}</div>
          <div className="text-xs text-gray-700 dark:text-gray-300">Skipped</div>
        </div>
        <div
          className={`border rounded p-3 ${
            report.failed > 0
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
          }`}
        >
          <div
            className={`text-2xl font-bold ${
              report.failed > 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {report.failed}
          </div>
          <div
            className={`text-xs ${
              report.failed > 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            Failed
          </div>
        </div>
      </div>
      {report.errors.length > 0 && (
        <div className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
          <div className="font-semibold mb-1">Errors:</div>
          <ul className="list-disc list-inside space-y-0.5">
            {report.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <button
        onClick={onReset}
        className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded px-3 py-1.5 text-sm hover:bg-black dark:hover:bg-white"
      >
        Import another file
      </button>
    </div>
  );
}
