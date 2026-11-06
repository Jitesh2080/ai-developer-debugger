import type { NextFunction, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { verifyToken } from '../services/auth.js';

// Augment Express's Request so handlers can read req.userId type-safely.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Requires a valid Bearer JWT; sets req.userId or responds 401. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = token ? verifyToken(token) : null;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.userId = userId;
  next();
}

/** Ensures the :projectId in the route belongs to the authenticated user. */
export async function requireProjectAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const projectId = (req.params as { projectId?: string }).projectId;
  if (!projectId) {
    res.status(400).json({ error: 'Missing projectId' });
    return;
  }
  const { rows } = await query<{ user_id: string }>(
    'SELECT user_id FROM projects WHERE id = $1',
    [projectId],
  );
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  if (row.user_id !== req.userId) {
    res.status(403).json({ error: 'You do not have access to this project' });
    return;
  }
  next();
}
