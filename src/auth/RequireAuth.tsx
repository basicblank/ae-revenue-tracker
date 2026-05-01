import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { supabase } from '@/lib/supabase';
import { isAllowlisted } from '@/data/allowlist';

type AllowState = 'checking' | 'allowed' | 'denied';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [allowState, setAllowState] = useState<AllowState>('checking');

  useEffect(() => {
    let active = true;
    if (!session?.user.email) {
      setAllowState('checking');
      return;
    }
    isAllowlisted(session.user.email).then((ok) => {
      if (!active) return;
      if (ok) {
        setAllowState('allowed');
      } else {
        setAllowState('denied');
        supabase.auth.signOut();
      }
    });
    return () => {
      active = false;
    };
  }, [session?.user.email]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  if (allowState === 'checking') return <div className="p-8">Verifying access...</div>;
  if (allowState === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-2">Access denied</h1>
          <p className="text-gray-600">
            Your email is not authorized for this dashboard. Contact Stefan to request access.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
