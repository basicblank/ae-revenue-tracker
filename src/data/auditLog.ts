import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type AuditEntity = 'allocation' | 'team_member' | 'member_payout' | string;
export type AuditAction = 'insert' | 'update' | 'delete';

export type AuditLogEntry = {
  id: string;
  entity: AuditEntity;
  action: AuditAction;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  actor_email: string | null;
  actor_id: string | null;
  created_at: string;
};

export function useAuditLog(opts: { entity?: AuditEntity; limit?: number } = {}) {
  const { entity, limit = 200 } = opts;
  return useQuery({
    queryKey: ['audit-log', entity ?? 'all', limit],
    queryFn: async (): Promise<AuditLogEntry[]> => {
      let q = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (entity) q = q.eq('entity', entity);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        entity: r.entity as AuditEntity,
        action: r.action as AuditAction,
        old_data: r.old_data as Record<string, unknown> | null,
        new_data: r.new_data as Record<string, unknown> | null,
        actor_email: r.actor_email as string | null,
        actor_id: r.actor_id as string | null,
        created_at: r.created_at as string,
      }));
    },
  });
}
