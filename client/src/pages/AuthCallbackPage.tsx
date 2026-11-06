import { useEffect } from 'react';
import { setToken } from '../auth/token';

/**
 * Lands here after Google OAuth. The backend put the JWT in the URL fragment
 * (#token=...); we store it and reload into the app.
 */
export function AuthCallbackPage() {
  useEffect(() => {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const token = hash.get('token');
    if (token) {
      setToken(token);
      location.href = '/';
    } else {
      location.href = '/login';
    }
  }, []);

  return (
    <div className="flex min-h-full items-center justify-center text-slate-400">
      Signing you in…
    </div>
  );
}
