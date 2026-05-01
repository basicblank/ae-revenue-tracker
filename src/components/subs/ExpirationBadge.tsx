type Props = { daysUntilExpiry: number };

export function ExpirationBadge({ daysUntilExpiry: d }: Props) {
  let color = 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400';
  if (d < 0) color = 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500';
  else if (d <= 7) color = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
  else if (d <= 14) color = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400';
  else if (d <= 30) color = 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';

  const label =
    d < 0
      ? `Expired ${Math.abs(d)}d ago`
      : d === 0
        ? 'Expires today'
        : d === 1
          ? '1 day left'
          : `${d} days left`;

  return <span className={`inline-block text-xs px-2 py-0.5 rounded ${color}`}>{label}</span>;
}
