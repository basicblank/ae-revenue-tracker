import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

type Mode = 'magic' | 'password';
type Status = 'idle' | 'sending' | 'sent' | 'error';

export function LoginPage() {
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<Mode>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (loading) return <div className="p-8">Loading...</div>;
  if (session) return <Navigate to="/" replace />;

  const switchMode = (next: Mode) => {
    setMode(next);
    setStatus('idle');
    setErrorMsg('');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');

    if (mode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (error) {
        setStatus('error');
        setErrorMsg(error.message);
      } else {
        setStatus('sent');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        setStatus('error');
        setErrorMsg(error.message);
      }
    }
  };

  const tabClass = (m: Mode) =>
    `px-3 py-2 -mb-px border-b-2 ${
      mode === m
        ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'
        : 'border-transparent text-gray-500'
    }`;

  const inputClass =
    'w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500 dark:focus:border-gray-400';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 shadow-sm">
        <h1 className="text-xl font-bold mb-1">AE Sub Revenue Tracker</h1>
        <p className="text-sm text-gray-500 mb-4">
          {mode === 'magic' ? 'Sign in with a magic link.' : 'Sign in with email and password.'}
        </p>

        <div className="flex border-b border-gray-200 dark:border-gray-800 mb-4 text-sm">
          <button type="button" onClick={() => switchMode('magic')} className={tabClass('magic')}>
            Magic link
          </button>
          <button type="button" onClick={() => switchMode('password')} className={tabClass('password')}>
            Password
          </button>
        </div>

        {status === 'sent' && mode === 'magic' ? (
          <p className="text-sm text-green-700 dark:text-green-400">
            Check your inbox at <strong>{email}</strong> for a sign-in link.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
            {mode === 'password' && (
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className={inputClass}
              />
            )}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded px-3 py-2 text-sm hover:bg-black dark:hover:bg-white disabled:opacity-50"
            >
              {status === 'sending'
                ? mode === 'magic'
                  ? 'Sending...'
                  : 'Signing in...'
                : mode === 'magic'
                  ? 'Send magic link'
                  : 'Sign in'}
            </button>
            {status === 'error' && (
              <p className="text-sm text-red-600 dark:text-red-400 break-words">{errorMsg}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
