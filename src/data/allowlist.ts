import { supabase } from '@/lib/supabase';

export async function isAllowlisted(email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('allowed_users')
    .select('email')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) return false;
  return data !== null;
}
