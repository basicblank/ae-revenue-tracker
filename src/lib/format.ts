import { format, parse, isValid } from 'date-fns';

export const DATE_FORMAT = 'MM/dd/yyyy';

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (!isValid(date)) return '';
  return format(date, DATE_FORMAT);
}

export function parseDate(s: string): Date | null {
  const d = parse(s, DATE_FORMAT, new Date());
  return isValid(d) ? d : null;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatUSD = (n: number) => usd.format(n);
