function required(key: keyof ImportMetaEnv): string {
  const v = import.meta.env[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`Missing required env var ${key}`);
  }
  return v;
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL'),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY'),
  ownerEmail: required('VITE_OWNER_EMAIL'),
};
