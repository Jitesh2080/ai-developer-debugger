import { Router } from 'express';
import { z } from 'zod';
import type { Repository } from '@ai-debugger/shared';
import { query } from '../db/pool.js';
import { cloneOrPull } from '../repos/gitClone.js';

// Mounted at /api/projects/:projectId/repositories
export const repositoriesRouter = Router({ mergeParams: true });

const connectSchema = z.object({
  url: z.string().url(),
  defaultBranch: z.string().min(1).max(200).optional(),
});

function mapRepo(r: {
  id: string;
  project_id: string;
  provider: string;
  url: string;
  default_branch: string;
  local_path: string | null;
  last_cloned_at: string | null;
  created_at: string;
}): Repository {
  return {
    id: r.id,
    projectId: r.project_id,
    provider: r.provider,
    url: r.url,
    defaultBranch: r.default_branch,
    localPath: r.local_path,
    lastClonedAt: r.last_cloned_at,
    createdAt: r.created_at,
  };
}

repositoriesRouter.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM repositories WHERE project_id = $1 ORDER BY created_at DESC`,
    [req.params.projectId],
  );
  res.json(rows.map(mapRepo));
});

repositoriesRouter.post('/', async (req, res) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const projectId = req.params.projectId!;
  const defaultBranch = parsed.data.defaultBranch ?? 'main';

  // Insert first to obtain the id used as the clone directory name.
  const inserted = await query<{ id: string }>(
    `INSERT INTO repositories (project_id, provider, url, default_branch)
     VALUES ($1, 'github', $2, $3) RETURNING id`,
    [projectId, parsed.data.url, defaultBranch],
  );
  const repoId = inserted.rows[0]!.id;

  try {
    const localPath = await cloneOrPull({
      repositoryId: repoId,
      url: parsed.data.url,
      defaultBranch,
    });
    const { rows } = await query(
      `UPDATE repositories
          SET local_path = $2, last_cloned_at = now()
        WHERE id = $1 RETURNING *`,
      [repoId, localPath],
    );
    res.status(201).json(mapRepo(rows[0]!));
  } catch (err) {
    await query(`DELETE FROM repositories WHERE id = $1`, [repoId]);
    res.status(400).json({ error: `Clone failed: ${(err as Error).message}` });
  }
});
