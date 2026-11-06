import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-full">
      <header className="border-b border-ink-700 bg-ink-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl">🛠️</span>
            <span className="text-lg font-semibold text-slate-100">
              AI Developer Debugger
            </span>
          </Link>
          <span className="rounded-full border border-ink-700 px-2 py-0.5 text-xs text-slate-500">
            MCP-powered
          </span>
          {user && (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm text-slate-400">{user.name}</span>
              <button
                onClick={logout}
                className="rounded-lg border border-ink-700 px-3 py-1 text-sm text-slate-300 hover:border-slate-500"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
