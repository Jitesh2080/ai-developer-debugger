import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Layout({ children }: { children: ReactNode }) {
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
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
