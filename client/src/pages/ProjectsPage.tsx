import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Project } from '@ai-debugger/shared';
import { api } from '../api/client';
import { Layout } from '../components/Layout';

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .listProjects()
      .then(setProjects)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const project = await api.createProject(name.trim(), description.trim());
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold text-slate-100">Projects</h1>
      <p className="mt-1 text-slate-400">
        Create a project, connect a repository and docs, then let the agent
        investigate your errors.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="mt-6 grid gap-3 rounded-xl border border-ink-700 bg-ink-800/50 p-5 sm:grid-cols-[1fr_1fr_auto]"
      >
        <input
          className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          type="submit"
          className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-500"
        >
          Create
        </button>
      </form>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-slate-500">No projects yet. Create one above.</p>
        ) : (
          projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="rounded-xl border border-ink-700 bg-ink-800/50 p-5 transition hover:border-sky-600"
            >
              <h2 className="font-medium text-slate-100">{p.name}</h2>
              {p.description && (
                <p className="mt-1 text-sm text-slate-400">{p.description}</p>
              )}
              <p className="mt-3 text-xs text-slate-600">
                {new Date(p.createdAt).toLocaleString()}
              </p>
            </Link>
          ))
        )}
      </div>
    </Layout>
  );
}
