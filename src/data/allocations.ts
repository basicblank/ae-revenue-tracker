import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type MonthlyAllocation = {
  year: number;
  month: number;
  member_id: string;
  pct: number;
  frozen: boolean;
  updated_at: string;
};

export type Payout = {
  member_id: string | null;
  member_name: string;
  pct: number;
  payout: number;
};

export function useAllocations(year: number, month: number) {
  return useQuery({
    queryKey: ['allocations', year, month],
    queryFn: async (): Promise<MonthlyAllocation[]> => {
      const { data, error } = await supabase
        .from('monthly_allocations')
        .select('*')
        .eq('year', year)
        .eq('month', month);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        year: Number(r.year),
        month: Number(r.month),
        member_id: r.member_id as string,
        pct: Number(r.pct),
        frozen: Boolean(r.frozen),
        updated_at: r.updated_at as string,
      }));
    },
  });
}

export function usePayouts(year: number, month: number) {
  return useQuery({
    queryKey: ['payouts', year, month],
    queryFn: async (): Promise<Payout[]> => {
      const { data, error } = await supabase.rpc('fn_payouts', {
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      return (data ?? []).map((r: Partial<Payout>) => ({
        member_id: r.member_id ?? null,
        member_name: String(r.member_name ?? ''),
        pct: Number(r.pct ?? 0),
        payout: Number(r.payout ?? 0),
      }));
    },
  });
}

export function useUpsertAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      year: number;
      month: number;
      member_id: string;
      pct: number;
    }) => {
      const { error } = await supabase
        .from('monthly_allocations')
        .upsert(input, { onConflict: 'year,month,member_id' });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['allocations', vars.year, vars.month] });
      qc.invalidateQueries({ queryKey: ['payouts', vars.year, vars.month] });
    },
  });
}

export function useRollAllocations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      const { error } = await supabase.rpc('fn_roll_allocations', {
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['allocations'] });
      qc.invalidateQueries({ queryKey: ['payouts'] });
    },
  });
}
