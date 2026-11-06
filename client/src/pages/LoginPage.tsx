import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login, register, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  useEffect(() => {
    authApi
      .config()
      .then((c) => setGoogleEnabled(c.googleEnabled))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, name);
      navigate('/');
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ''));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-800/60 p-8">
        <div className="mb-6 text-center">
          <div className="text-3xl">🛠️</div>
          <h1 className="mt-2 text-xl font-semibold text-slate-100">
            AI Developer Debugger
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <input
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            type="email"
            required
            className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {googleEnabled && (
          <a
            href={authApi.googleUrl()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-ink-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
          >
            <span>Sign in with Google</span>
          </a>
        )}

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-200"
        >
          {mode === 'login'
            ? "Don't have an account? Register"
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
