type Props = {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
};

export function MonthPicker({ year, month, onChange }: Props) {
  const value = `${year}-${String(month).padStart(2, '0')}`;
  return (
    <input
      type="month"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        const [y, m] = v.split('-').map(Number);
        if (y && m) onChange(y, m);
      }}
      className="border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded px-2 py-1.5 text-sm"
    />
  );
}
