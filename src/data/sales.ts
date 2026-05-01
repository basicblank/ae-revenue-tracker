import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { invalidateSalesData } from '@/lib/queryClient';
import type { Sale, SaleEnriched, SaleInput } from '@/types/domain';

const SALES_KEY = ['sales'] as const;
const ACTIVE_KEY = ['sales', 'active'] as const;

export function useSales() {
  return useQuery({
    queryKey: SALES_KEY,
    queryFn: async (): Promise<SaleEnriched[]> => {
      const { data, error } = await supabase
        .from('v_sales_enriched')
        .select('*')
        .order('transaction_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SaleEnriched[];
    },
  });
}

export function useActiveSales() {
  return useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: async (): Promise<SaleEnriched[]> => {
      const { data, error } = await supabase
        .from('v_sales_enriched')
        .select('*')
        .eq('is_active', true)
        .order('expiration_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SaleEnriched[];
    },
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaleInput): Promise<Sale> => {
      const { data, error } = await supabase
        .from('sales')
        .insert({
          email: input.email,
          category: input.category,
          plan: input.plan,
          paid_amount: input.paid_amount,
          transaction_date: input.transaction_date,
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Sale;
    },
    onSuccess: () => invalidateSalesData(qc),
  });
}

export function useDeleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sales').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateSalesData(qc),
  });
}
