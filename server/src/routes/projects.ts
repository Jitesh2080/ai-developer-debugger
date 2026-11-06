import { Router } from 'express';
import { z } from 'zod';
import type { Project } from '@ai-debugger/shared';
import { query } from '../db/pool.js';

export const projectsRouter = Router();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

function mapProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
  };
}

projectsRouter.get('/', async (req, res) => {
  const { rows } = await query<ProjectRow>(
    `SELECT id, name, description, created_at FROM projects
      WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.userId!],
  );
  res.json(rows.map(mapProject));
});

projectsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { rows } = await query<ProjectRow>(
    `INSERT INTO projects (user_id, name, description)
     VALUES ($1, $2, $3) RETURNING id, name, description, created_at`,
    [req.userId!, parsed.data.name, parsed.data.description ?? null],
  );
  res.status(201).json(mapProject(rows[0]!));
});

projectsRouter.get('/:projectId', async (req, res) => {
  const { rows } = await query<ProjectRow>(
    `SELECT id, name, description, created_at FROM projects
      WHERE id = $1 AND user_id = $2`,
    [req.params.projectId, req.userId!],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(mapProject(rows[0]!));
});
