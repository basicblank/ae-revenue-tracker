import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function AuthCallback() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading) navigate(session ? '/' : '/login', { replace: true });
  }, [loading, session, navigate]);
  return <div className="p-8">Completing sign in...</div>;
}
