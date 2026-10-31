import type { Diagnosis, Evidence } from '@ai-debugger/shared';
import { ConfidenceMeter } from './ConfidenceMeter';

const KIND_LABEL: Record<Evidence['kind'], string> = {
  source: 'Source',
  commit: 'Commit',
  log: 'Log',
  documentation: 'Docs',
  schema: 'Schema',
};

function EvidenceRow({ e }: { e: Evidence }) {
  return (
    <li className="rounded-lg border border-ink-700 bg-ink-900/60 p-3">
      <div className="flex items-center gap-2">
        <span className="rounded bg-ink-700 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-300">
          {KIND_LABEL[e.kind]}
        </span>
        <span className="font-medium text-slate-100">{e.title}</span>
        <span
          className={`ml-auto rounded px-2 py-0.5 text-xs font-medium ${
            e.verified
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-amber-500/15 text-amber-300'
          }`}
          title={
            e.verified
              ? 'Directly observed via a tool call'
              : 'An inference by the agent, not directly verified'
          }
        >
          {e.verified ? 'Verified' : 'Assumption'}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-300">{e.detail}</p>
      {e.location && (
        <p className="mt-1 font-mono text-xs text-slate-500">{e.location}</p>
      )}
    </li>
  );
}

export function DiagnosisCard({ d }: { d: Diagnosis }) {
  return (
    <div className="space-y-6 rounded-xl border border-ink-700 bg-ink-800/50 p-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Root Cause
        </h3>
        <p className="mt-2 text-slate-100">{d.rootCause}</p>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Evidence
        </h3>
        {d.evidence.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No evidence recorded.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {d.evidence.map((e, i) => (
              <EvidenceRow key={i} e={e} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Suggested Fix
        </h3>
        <p className="mt-2 whitespace-pre-wrap text-slate-200">
          {d.suggestedFix}
        </p>
      </section>

      {d.affectedFiles.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Affected Files
          </h3>
          <ul className="mt-2 space-y-1">
            {d.affectedFiles.map((f, i) => (
              <li key={i} className="font-mono text-sm text-sky-300">
                {f}
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.references.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Relevant Documentation
          </h3>
          <ul className="mt-2 space-y-2">
            {d.references.map((r, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-slate-200">{r.title}</span>
                <span className="text-slate-500"> — {r.source}</span>
                {r.snippet && (
                  <p className="mt-1 text-slate-400">{r.snippet}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="max-w-xs">
        <ConfidenceMeter value={d.confidence} />
      </div>
    </div>
  );
}
