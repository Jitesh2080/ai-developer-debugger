import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import './index.css';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectPage } from './pages/ProjectPage';
import { SessionDetailPage } from './pages/SessionDetailPage';

const router = createBrowserRouter([
  { path: '/', element: <ProjectsPage /> },
  { path: '/projects/:projectId', element: <ProjectPage /> },
  {
    path: '/projects/:projectId/sessions/:sessionId',
    element: <SessionDetailPage />,
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
