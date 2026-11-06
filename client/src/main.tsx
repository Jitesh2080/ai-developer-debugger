import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
} from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectPage } from './pages/ProjectPage';
import { SessionDetailPage } from './pages/SessionDetailPage';
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';

/** Gate that redirects to /login when there's no authenticated user. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <ProjectsPage />
      </RequireAuth>
    ),
  },
  {
    path: '/projects/:projectId',
    element: (
      <RequireAuth>
        <ProjectPage />
      </RequireAuth>
    ),
  },
  {
    path: '/projects/:projectId/sessions/:sessionId',
    element: (
      <RequireAuth>
        <SessionDetailPage />
      </RequireAuth>
    ),
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>,
);
