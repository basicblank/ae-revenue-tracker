type Props = { daysUntilExpiry: number };

export function ExpirationBadge({ daysUntilExpiry: d }: Props) {
  let color = 'bg-green-100 text-green-700';
  if (d < 0) color = 'bg-gray-100 text-gray-500';
  else if (d <= 7) color = 'bg-red-100 text-red-700';
  else if (d <= 14) color = 'bg-amber-100 text-amber-700';
  else if (d <= 30) color = 'bg-yellow-50 text-yellow-700';

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
