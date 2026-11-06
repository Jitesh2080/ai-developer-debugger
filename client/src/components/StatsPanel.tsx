import { useEffect, useState } from 'react';
import type { ProjectStats } from '@ai-debugger/shared';
import { api } from '../api/client';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-3">
      <div className="text-lg font-semibold text-slate-100">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export function StatsPanel({ projectId }: { projectId: string }) {
  const [stats, setStats] = useState<ProjectStats | null>(null);

  useEffect(() => {
    api.getStats(projectId).then(setStats).catch(() => {});
  }, [projectId]);

  if (!stats || stats.totalSessions === 0) return null;

  return (
    <section className="rounded-xl border border-ink-700 bg-ink-800/50 p-4">
      <h2 className="text-sm font-semibold text-slate-200">Project metrics</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Investigations" value={stats.totalSessions} />
        <Stat label="Completed" value={stats.completedSessions} />
        <Stat
          label="Avg confidence"
          value={stats.avgConfidence != null ? `${stats.avgConfidence}%` : '—'}
        />
        <Stat label="Tool calls" value={stats.totalToolCalls} />
        <Stat
          label="Avg steps/run"
          value={stats.avgStepsPerRun ?? '—'}
        />
        <Stat
          label="Avg tool time"
          value={
            stats.avgToolDurationMs != null ? `${stats.avgToolDurationMs} ms` : '—'
          }
        />
      </div>
      {stats.toolUsage.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-slate-500">Most-used tools</div>
          <ul className="space-y-1 text-xs text-slate-400">
            {stats.toolUsage.slice(0, 5).map((t) => (
              <li key={`${t.server}.${t.tool}`} className="flex justify-between">
                <span className="font-mono">
                  {t.server}.{t.tool}
                </span>
                <span>{t.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
