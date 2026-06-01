import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { invalidateSalesData } from '@/lib/queryClient';

const SYNC_STATE_KEY = ['sync_state', 'stripe_revenue'] as const;

export type SyncSkipReasons = {
  non_usd: number;
  unmappable_amount: number;
  usd_but_amount_null: number;
  collision_different_invoice: number;
};

export type SyncResult = {
  fetched: number;
  inserted: number;
  reconciled: number;
  skipped_already_synced: number;
  skipped: SyncSkipReasons;
  unmappable_samples: { invoice: string; amount: number }[];
  pages: number;
};

export type SyncState = {
  key: string;
  latest_paid_at: string | null;
  latest_invoice_id: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_result: SyncResult | null;
  updated_at: string;
};

export function useStripeSyncState() {
  return useQuery({
    queryKey: SYNC_STATE_KEY,
    queryFn: async (): Promise<SyncState | null> => {
      const { data, error } = await supabase
        .from('sync_state')
        .select('*')
        .eq('key', 'stripe_revenue')
        .maybeSingle();
      if (error) throw error;
      return (data as SyncState | null) ?? null;
    },
  });
}

export function useRunStripeSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      const { data, error } = await supabase.functions.invoke<SyncResult & { ok: boolean }>(
        'stripe-sync',
        { body: {} },
      );
      if (error) throw error;
      if (!data || !data.ok) throw new Error('Sync returned no result');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SYNC_STATE_KEY });
      invalidateSalesData(qc);
    },
  });
}
