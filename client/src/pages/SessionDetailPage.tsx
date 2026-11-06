import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DebugSessionDetail } from '@ai-debugger/shared';
import { api } from '../api/client';
import { Layout } from '../components/Layout';
import { DiagnosisCard } from '../components/DiagnosisCard';
import { FixProposals } from '../components/FixProposals';

export function SessionDetailPage() {
  const { projectId = '', sessionId = '' } = useParams();
  const [session, setSession] = useState<DebugSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSession(projectId, sessionId)
      .then(setSession)
      .catch((e) => setError(String(e)));
  }, [projectId, sessionId]);

  return (
    <Layout>
      <Link
        to={`/projects/${projectId}`}
        className="text-sm text-slate-500 hover:text-slate-300"
      >
        ← Back to project
      </Link>

      {error && (
        <div className="mt-4 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {session && (
        <div className="mt-2 space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">
              {session.title}
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {session.status} · {new Date(session.createdAt).toLocaleString()}
            </p>
          </div>

          <section className="rounded-xl border border-ink-700 bg-ink-800/50 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Error
            </h2>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-950 p-3 font-mono text-sm text-rose-300">
              {session.errorText}
            </pre>
            {session.technologies.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {session.errorType} · {session.technologies.join(', ')}
              </p>
            )}
          </section>

          <section className="rounded-xl border border-ink-700 bg-ink-800/50 p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              MCP tool calls ({session.toolCalls.length})
            </h2>
            <ol className="space-y-2">
              {session.toolCalls.map((t) => (
                <li
                  key={t.id}
                  className="rounded-lg border border-ink-700 bg-ink-900/60 p-3"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">#{t.stepIndex}</span>
                    <span className="rounded bg-ink-700 px-1.5 py-0.5 text-xs text-slate-400">
                      {t.serverName}
                    </span>
                    <span className="font-mono font-medium text-sky-300">
                      {t.toolName}
                    </span>
                    <span
                      className={`ml-auto text-xs ${
                        t.status === 'error'
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <pre className="mt-2 overflow-x-auto rounded bg-ink-950 p-2 text-xs text-slate-400">
                    {JSON.stringify(t.arguments)}
                  </pre>
                </li>
              ))}
            </ol>
          </section>

          {session.solution && <DiagnosisCard d={session.solution} />}

          {session.solution && (
            <FixProposals
              projectId={projectId}
              sessionId={sessionId}
              canPropose={true}
            />
          )}
        </div>
      )}
    </Layout>
  );
}
