import { useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { env } from '@/lib/env';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/sales', label: 'Sales' },
  { to: '/active', label: 'Active subs' },
  { to: '/team', label: 'Team allocation' },
  { to: '/payouts', label: 'Payouts' },
  { to: '/import', label: 'Import', ownerOnly: true },
];

export function AppShell() {
  const { session } = useAuth();
  const isOwner = session?.user.email === env.ownerEmail;
  const qc = useQueryClient();

  useEffect(() => {
    const now = new Date();
    supabase
      .rpc('fn_roll_allocations', {
        p_year: now.getFullYear(),
        p_month: now.getMonth() + 1,
      })
      .then(({ error }) => {
        if (error) return;
        qc.invalidateQueries({ queryKey: ['allocations'] });
        qc.invalidateQueries({ queryKey: ['payouts'] });
      });
  }, [qc]);

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200">
          <h1 className="text-base font-bold">AE Sub Tracker</h1>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-1">
          {navItems
            .filter((item) => !item.ownerOnly || isOwner)
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block px-3 py-2 rounded text-sm ${
                    isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
        </nav>
        <div className="px-3 py-3 border-t border-gray-200 text-xs text-gray-500">
          <div className="truncate" title={session?.user.email}>
            {session?.user.email}
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-1 text-gray-700 hover:text-black"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
