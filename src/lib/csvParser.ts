import { parse as parseDateFn, isValid } from 'date-fns';
import type { SaleCategory, SalePlan } from '@/types/domain';

export type ParsedRow = {
  rowIndex: number;
  email: string;
  category: SaleCategory;
  plan: SalePlan;
  paid_amount: number;
  transaction_date: string;
  notes: string | null;
};

export type RowError = {
  rowIndex: number;
  reason: string;
};

export type ColumnMap = {
  email: string;
  category: string;
  plan: string;
  paid: string;
  transactionDate: string;
  notes: string | null;
};

export type ParseResult = {
  valid: ParsedRow[];
  errors: RowError[];
};

export type MapValidation = { ok: boolean; missing: string[] };

const SYNONYMS = {
  email: ['email', 'e-mail', 'mail'],
  category: ['category', 'payment method', 'payment type', 'method'],
  plan: ['1m / 3m(months)', '1m / 3m (months)', '1m / 3m', 'plan', 'duration', 'months', 'period'],
  paid: ['paid (amount)', 'paid amount', 'paid', 'amount', 'price'],
  transactionDate: ['transaction date', 'tx date', 'sale date', 'purchase date'],
  notes: ['notes', 'note', 'comment', 'comments'],
};

function findHeader(headers: string[], targets: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  const exact = headers.find((h) => targets.some((t) => norm(h) === norm(t)));
  if (exact) return exact;
  for (const t of targets) {
    const partial = headers.find((h) => norm(h).includes(norm(t)));
    if (partial) return partial;
  }
  return null;
}

export function autoMapColumns(headers: string[]): ColumnMap {
  return {
    email: findHeader(headers, SYNONYMS.email) ?? '',
    category: findHeader(headers, SYNONYMS.category) ?? '',
    plan: findHeader(headers, SYNONYMS.plan) ?? '',
    paid: findHeader(headers, SYNONYMS.paid) ?? '',
    transactionDate: findHeader(headers, SYNONYMS.transactionDate) ?? '',
    notes: findHeader(headers, SYNONYMS.notes),
  };
}

export function validateColumnMap(map: ColumnMap): MapValidation {
  const required: { key: keyof ColumnMap; label: string }[] = [
    { key: 'email', label: 'Email' },
    { key: 'category', label: 'Category' },
    { key: 'plan', label: 'Plan' },
    { key: 'paid', label: 'Paid' },
    { key: 'transactionDate', label: 'Transaction date' },
  ];
  const missing = required.filter((r) => !map[r.key]).map((r) => r.label);
  return { ok: missing.length === 0, missing };
}

export function normalizeCategory(s: string): SaleCategory | null {
  const v = s.trim().toLowerCase();
  if (v === 'stripe') return 'stripe';
  if (v === 'nowpayments' || v === 'now payments' || v === 'now-payments') return 'nowpayments';
  return null;
}

export function normalizePlan(s: string): SalePlan | null {
  const v = s.trim().toLowerCase();
  if (v === '1' || v === '1m' || v === '1 month' || v === '1 mo') return '1m';
  if (v === '3' || v === '3m' || v === '3 months' || v === '3 mo') return '3m';
  return null;
}

export function parsePaid(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, '').replace(/[^\d.\-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const DATE_FORMATS = ['MM/dd/yyyy', 'M/d/yyyy', 'MM/dd/yy', 'M/d/yy'];

export function parseTransactionDate(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  for (const fmt of DATE_FORMATS) {
    const d = parseDateFn(trimmed, fmt, new Date());
    if (isValid(d)) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  return null;
}

export function parseRows(rows: Record<string, string>[], map: ColumnMap): ParseResult {
  const valid: ParsedRow[] = [];
  const errors: RowError[] = [];

  rows.forEach((raw, idx) => {
    const rowIndex = idx + 2;
    const get = (key: string) => (raw[key] ?? '').toString().trim();

    const email = get(map.email).toLowerCase();
    if (!email) {
      errors.push({ rowIndex, reason: 'Missing email' });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      errors.push({ rowIndex, reason: `Invalid email: "${email}"` });
      return;
    }

    const categoryRaw = get(map.category);
    const category = normalizeCategory(categoryRaw);
    if (!category) {
      errors.push({ rowIndex, reason: `Unknown category: "${categoryRaw}"` });
      return;
    }

    const planRaw = get(map.plan);
    const plan = normalizePlan(planRaw);
    if (!plan) {
      errors.push({ rowIndex, reason: `Unknown plan: "${planRaw}"` });
      return;
    }

    const paidRaw = get(map.paid);
    const paid = parsePaid(paidRaw);
    if (paid === null) {
      errors.push({ rowIndex, reason: `Invalid paid amount: "${paidRaw}"` });
      return;
    }

    const txRaw = get(map.transactionDate);
    const txDate = parseTransactionDate(txRaw);
    if (!txDate) {
      errors.push({ rowIndex, reason: `Invalid date (expected MM/DD/YYYY): "${txRaw}"` });
      return;
    }

    const notes = map.notes ? get(map.notes) || null : null;

    valid.push({
      rowIndex,
      email,
      category,
      plan,
      paid_amount: paid,
      transaction_date: txDate,
      notes,
    });
  });

  return { valid, errors };
}

export function dedupKey(email: string, transactionDate: string, paidAmount: number): string {
  return `${email}|${transactionDate}|${paidAmount}`;
}
