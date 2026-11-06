import { useEffect, useState } from 'react';
import type { FixProposal } from '@ai-debugger/shared';
import { api } from '../api/client';

export function FixProposals({
  projectId,
  sessionId,
  canPropose,
}: {
  projectId: string;
  sessionId: string;
  canPropose: boolean;
}) {
  const [proposals, setProposals] = useState<FixProposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = () =>
    api.listProposals(projectId, sessionId).then(setProposals).catch(() => {});

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sessionId]);

  async function handlePropose() {
    setBusy(true);
    setNote(null);
    try {
      await api.proposeFix(projectId, sessionId);
      await refresh();
    } catch (err) {
      setNote(`Could not propose a fix: ${err}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(id: string) {
    const res = await api.approveProposal(projectId, id);
    setNote(
      res.writesEnabled
        ? 'Approved and written to the local clone.'
        : 'Approved (writes are disabled — set ENABLE_WRITE_ACTIONS=true to apply to disk).',
    );
    refresh();
  }

  async function handleReject(id: string) {
    await api.rejectProposal(projectId, id);
    refresh();
  }

  return (
    <section className="rounded-xl border border-ink-700 bg-ink-800/50 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Suggested code fix (human-in-the-loop)
        </h2>
        {canPropose && (
          <button
            onClick={handlePropose}
            disabled={busy}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Propose a fix'}
          </button>
        )}
      </div>

      {note && <p className="mt-3 text-sm text-amber-300">{note}</p>}

      {proposals.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No fix proposed yet. The agent can draft a change for you to review.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {proposals.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-ink-700 bg-ink-900/60 p-4"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-sky-300">
                  {p.filePath}
                </span>
                <span
                  className={`ml-auto rounded px-2 py-0.5 text-xs ${
                    p.status === 'pending'
                      ? 'bg-amber-500/15 text-amber-300'
                      : p.status === 'rejected'
                        ? 'bg-rose-500/15 text-rose-300'
                        : 'bg-emerald-500/15 text-emerald-300'
                  }`}
                >
                  {p.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{p.explanation}</p>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-slate-400">
                  View proposed file content
                </summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded bg-ink-950 p-3 text-xs text-slate-300">
                  {p.proposedContent}
                </pre>
              </details>

              {p.status === 'pending' && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleApprove(p.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(p.id)}
                    className="rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-slate-300 hover:border-rose-500"
                  >
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
