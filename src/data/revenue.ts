import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { SaleCategory } from '@/types/domain';

export type MtdKpis = {
  gross_mtd: number;
  tax_mtd: number;
  net_mtd: number;
  new_subs_mtd: number;
  renewals_mtd: number;
};

export type MonthlyRevenueRow = {
  month_start: string;
  category: SaleCategory;
  sale_count: number;
  gross: number;
  tax: number;
  net: number;
};

export function useMtdKpis() {
  return useQuery({
    queryKey: ['kpis', 'mtd'],
    queryFn: async (): Promise<MtdKpis> => {
      const { data, error } = await supabase.rpc('fn_mtd_kpis');
      if (error) throw error;
      const row = (data as Partial<MtdKpis>[] | null)?.[0];
      return {
        gross_mtd: Number(row?.gross_mtd ?? 0),
        tax_mtd: Number(row?.tax_mtd ?? 0),
        net_mtd: Number(row?.net_mtd ?? 0),
        new_subs_mtd: Number(row?.new_subs_mtd ?? 0),
        renewals_mtd: Number(row?.renewals_mtd ?? 0),
      };
    },
  });
}

export function useMonthlyRevenue() {
  return useQuery({
    queryKey: ['revenue', 'monthly'],
    queryFn: async (): Promise<MonthlyRevenueRow[]> => {
      const { data, error } = await supabase
        .from('v_monthly_revenue')
        .select('*')
        .order('month_start', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        month_start: r.month_start as string,
        category: r.category as SaleCategory,
        sale_count: Number(r.sale_count),
        gross: Number(r.gross),
        tax: Number(r.tax),
        net: Number(r.net),
      }));
    },
  });
}
