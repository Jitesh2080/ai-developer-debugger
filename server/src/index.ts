import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from './config/env.js';
import { requireAuth, requireProjectAccess } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { debugRouter } from './routes/debug.js';
import { documentsRouter } from './routes/documents.js';
import { projectsRouter } from './routes/projects.js';
import { repositoriesRouter } from './routes/repositories.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', provider: env.LLM_PROVIDER });
  });

  // Public auth endpoints (register/login/google).
  app.use('/api/auth', authRouter);

  // Everything below requires a valid JWT; project subroutes also check ownership.
  app.use('/api/projects', requireAuth, projectsRouter);
  app.use(
    '/api/projects/:projectId/repositories',
    requireAuth,
    requireProjectAccess,
    repositoriesRouter,
  );
  app.use(
    '/api/projects/:projectId/documents',
    requireAuth,
    requireProjectAccess,
    documentsRouter,
  );
  app.use(
    '/api/projects/:projectId',
    requireAuth,
    requireProjectAccess,
    debugRouter,
  );

  // Centralized error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api] unhandled error', err);
    if (res.headersSent) return;
    res.status(500).json({ error: (err as Error).message ?? 'Internal error' });
  });

  return app;
}

// Start the server unless running under tests (which import createApp directly).
if (env.NODE_ENV !== 'test') {
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT}`);
  });
}
