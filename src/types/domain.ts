export type SaleCategory = 'stripe' | 'nowpayments';
export type SalePlan = '1m' | '3m';

export type Sale = {
  id: string;
  email: string;
  category: SaleCategory;
  plan: SalePlan;
  paid_amount: number;
  transaction_date: string;
  expiration_date: string;
  notes: string | null;
  created_at: string;
};

export type SaleEnriched = Sale & {
  net_amount: number;
  tax_setaside: number;
  is_active: boolean;
  days_until_expiry: number;
};

export type SaleInput = {
  email: string;
  category: SaleCategory;
  plan: SalePlan;
  paid_amount: number;
  transaction_date: string;
  notes?: string | null;
};

export const PLAN_DEFAULT_PRICE: Record<SalePlan, number> = {
  '1m': 39,
  '3m': 70,
};

export const PLAN_LABEL: Record<SalePlan, string> = {
  '1m': '1 month',
  '3m': '3 months',
};
