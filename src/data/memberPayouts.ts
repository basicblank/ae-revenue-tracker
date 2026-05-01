import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type MemberPayout = {
  id: string;
  member_id: string;
  year: number;
  month: number;
  paid_at: string;
  amount: number;
  notes: string | null;
  created_at: string;
};

export function useMemberPayouts(year: number, month: number) {
  return useQuery({
    queryKey: ['member-payouts', year, month],
    queryFn: async (): Promise<MemberPayout[]> => {
      const { data, error } = await supabase
        .from('member_payouts')
        .select('*')
        .eq('year', year)
        .eq('month', month)
        .order('paid_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        member_id: r.member_id,
        year: Number(r.year),
        month: Number(r.month),
        paid_at: r.paid_at,
        amount: Number(r.amount),
        notes: r.notes,
        created_at: r.created_at,
      }));
    },
  });
}

export function useCreateMemberPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      member_id: string;
      year: number;
      month: number;
      paid_at: string;
      amount: number;
      notes?: string | null;
    }) => {
      const { error } = await supabase.from('member_payouts').insert({
        member_id: input.member_id,
        year: input.year,
        month: input.month,
        paid_at: input.paid_at,
        amount: input.amount,
        notes: input.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['member-payouts', vars.year, vars.month] });
    },
  });
}

export function useDeleteMemberPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; year: number; month: number }) => {
      const { error } = await supabase.from('member_payouts').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['member-payouts', vars.year, vars.month] });
    },
  });
}
