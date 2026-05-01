import { useRef, useState } from 'react';
import Papa from 'papaparse';

type Props = {
  onParsed: (file: File, headers: string[], rows: Record<string, string>[]) => void;
};

export function CsvDropzone({ onParsed }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a .csv file');
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`Parse error: ${results.errors[0].message}`);
          return;
        }
        const rows = results.data;
        const headers = results.meta.fields ?? [];
        if (rows.length === 0) {
          setError('CSV is empty');
          return;
        }
        if (headers.length === 0) {
          setError('CSV has no header row');
          return;
        }
        onParsed(file, headers, rows);
      },
      error: (err) => setError(`Could not read file: ${err.message}`),
    });
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition ${
          dragOver ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400 bg-white'
        }`}
      >
        <p className="text-sm text-gray-700">Drop a CSV here, or click to choose</p>
        <p className="text-xs text-gray-500 mt-1">Dates must be MM/DD/YYYY</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
