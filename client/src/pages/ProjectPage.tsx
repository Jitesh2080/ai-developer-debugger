import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  AgentEvent,
  DebugSessionSummary,
  Diagnosis,
  DocumentMeta,
  Project,
  Repository,
} from '@ai-debugger/shared';
import { api, streamInvestigation } from '../api/client';
import { Layout } from '../components/Layout';
import { Timeline } from '../components/Timeline';
import { DiagnosisCard } from '../components/DiagnosisCard';
import { StatsPanel } from '../components/StatsPanel';

const SAMPLE_ERROR = `HanaError: SQL syntax error near 'DEFINERLANGUAGE'`;

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [sessions, setSessions] = useState<DebugSessionSummary[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  const [repoUrl, setRepoUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [errorText, setErrorText] = useState('');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refreshSessions = useCallback(() => {
    api.listSessions(projectId).then(setSessions).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    api.getProject(projectId).then(setProject).catch((e) => setBanner(String(e)));
    api.listRepositories(projectId).then(setRepos).catch(() => {});
    api.listDocuments(projectId).then(setDocs).catch(() => {});
    refreshSessions();
  }, [projectId, refreshSessions]);

  async function handleConnectRepo(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    setConnecting(true);
    setBanner(null);
    try {
      await api.connectRepository(projectId, repoUrl.trim());
      setRepoUrl('');
      setRepos(await api.listRepositories(projectId));
    } catch (err) {
      setBanner(`Repo connect failed: ${err}`);
    } finally {
      setConnecting(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setBanner(null);
    try {
      await api.uploadDocument(projectId, file);
      setDocs(await api.listDocuments(projectId));
    } catch (err) {
      setBanner(`Upload failed: ${err}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleInvestigate(e: React.FormEvent) {
    e.preventDefault();
    if (!errorText.trim() || running) return;
    setEvents([]);
    setDiagnosis(null);
    setRunning(true);
    setBanner(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamInvestigation(
        projectId,
        errorText,
        (ev) => {
          setEvents((prev) => [...prev, ev]);
          if (ev.type === 'final') setDiagnosis(ev.solution);
          if (ev.type === 'done') refreshSessions();
        },
        controller.signal,
      );
    } catch (err) {
      setBanner(`Investigation failed: ${err}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Layout>
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-300">
        ← All projects
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-100">
        {project?.name ?? 'Project'}
      </h1>

      {banner && (
        <div className="mt-4 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
          {banner}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Left column: setup + history */}
        <aside className="space-y-6">
          <StatsPanel projectId={projectId} />

          <section className="rounded-xl border border-ink-700 bg-ink-800/50 p-4">
            <h2 className="text-sm font-semibold text-slate-200">Repository</h2>
            <form onSubmit={handleConnectRepo} className="mt-3 space-y-2">
              <input
                className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                placeholder="https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
              />
              <button
                disabled={connecting}
                className="w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {connecting ? 'Cloning…' : 'Connect repository'}
              </button>
            </form>
            <ul className="mt-3 space-y-1 text-xs text-slate-400">
              {repos.map((r) => (
                <li key={r.id} className="truncate font-mono">
                  {r.localPath ? '✓ ' : '• '}
                  {r.url}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-ink-700 bg-ink-800/50 p-4">
            <h2 className="text-sm font-semibold text-slate-200">
              Documentation
            </h2>
            <label className="mt-3 block cursor-pointer rounded-lg border border-dashed border-ink-700 px-3 py-4 text-center text-sm text-slate-400 hover:border-sky-600">
              {uploading ? 'Uploading & embedding…' : 'Upload .md / .txt / .pdf'}
              <input
                type="file"
                accept=".md,.markdown,.txt,.pdf"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
            <ul className="mt-3 space-y-1 text-xs text-slate-400">
              {docs.map((d) => (
                <li key={d.id} className="flex justify-between">
                  <span className="truncate">{d.title}</span>
                  <span className="text-slate-600">{d.chunkCount ?? 0} ch</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-ink-700 bg-ink-800/50 p-4">
            <h2 className="text-sm font-semibold text-slate-200">History</h2>
            <ul className="mt-3 space-y-2">
              {sessions.length === 0 ? (
                <li className="text-xs text-slate-500">No sessions yet.</li>
              ) : (
                sessions.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={`/projects/${projectId}/sessions/${s.id}`}
                      className="block rounded-lg border border-ink-700 p-2 text-sm hover:border-sky-600"
                    >
                      <div className="truncate text-slate-200">{s.title}</div>
                      <div className="mt-1 flex justify-between text-xs text-slate-500">
                        <span>{s.status}</span>
                        {s.confidence != null && <span>{s.confidence}%</span>}
                      </div>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </section>
        </aside>

        {/* Right column: investigation */}
        <section className="space-y-6">
          <form
            onSubmit={handleInvestigate}
            className="rounded-xl border border-ink-700 bg-ink-800/50 p-5"
          >
            <label className="text-sm font-semibold text-slate-200">
              Error / stack trace
            </label>
            <textarea
              className="mt-2 h-32 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder={SAMPLE_ERROR}
              value={errorText}
              onChange={(e) => setErrorText(e.target.value)}
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                type="submit"
                disabled={running || !errorText.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {running ? 'Investigating…' : 'Start investigation'}
              </button>
              <button
                type="button"
                onClick={() => setErrorText(SAMPLE_ERROR)}
                className="text-sm text-slate-500 hover:text-slate-300"
              >
                Use sample error
              </button>
            </div>
          </form>

          {(events.length > 0 || running) && (
            <section className="rounded-xl border border-ink-700 bg-ink-800/50 p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-200">
                Live investigation
              </h2>
              <Timeline events={events} />
            </section>
          )}

          {diagnosis && <DiagnosisCard d={diagnosis} />}
        </section>
      </div>
    </Layout>
  );
}
