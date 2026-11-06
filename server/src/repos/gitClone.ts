import { mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { simpleGit } from 'simple-git';
import { env } from '../config/env.js';

/**
 * Injects a read-only token into an HTTPS GitHub URL so private repos can be
 * cloned. No-op for public repos / non-GitHub hosts.
 */
function authenticatedUrl(url: string): string {
  if (!env.GITHUB_TOKEN) return url;
  if (!url.startsWith('https://github.com/')) return url;
  return url.replace(
    'https://github.com/',
    `https://x-access-token:${env.GITHUB_TOKEN}@github.com/`,
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clones the repository into WORKSPACE_DIR/<repositoryId> (or pulls if it is
 * already there) and returns the local path. Read-only usage thereafter.
 */
export async function cloneOrPull(params: {
  repositoryId: string;
  url: string;
  defaultBranch: string;
}): Promise<string> {
  const workspace = resolve(env.WORKSPACE_DIR);
  await mkdir(workspace, { recursive: true });
  const dest = join(workspace, params.repositoryId);

  if (await exists(join(dest, '.git'))) {
    const git = simpleGit(dest);
    await git.fetch();
    try {
      await git.pull();
    } catch {
      // Detached/diverged clones shouldn't fail the whole flow.
    }
    return dest;
  }

  await simpleGit().clone(authenticatedUrl(params.url), dest, [
    '--depth',
    String(env.CLONE_DEPTH),
    '--branch',
    params.defaultBranch,
  ]).catch(async () => {
    // Fall back to default branch if the requested branch doesn't exist.
    await simpleGit().clone(authenticatedUrl(params.url), dest, [
      '--depth',
      String(env.CLONE_DEPTH),
    ]);
  });

  return dest;
}
