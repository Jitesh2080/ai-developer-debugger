import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';

/**
 * Helpers shared by the GitHub/Git MCP server tools. All operations are
 * read-only and constrained to the repository root given by REPO_PATH.
 */

export function getRepoRoot(): string {
  const root = process.env.REPO_PATH;
  if (!root) {
    throw new Error('REPO_PATH is not set; the github MCP server needs a clone.');
  }
  return resolve(root);
}

export function git(): SimpleGit {
  return simpleGit(getRepoRoot());
}

/**
 * Resolves a user/model-supplied relative path against the repo root and
 * refuses anything that escapes it (path-traversal guard).
 */
export function safeResolve(repoRoot: string, requested: string): string {
  const abs = resolve(repoRoot, requested);
  const rel = relative(repoRoot, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path escapes repository root: ${requested}`);
  }
  return abs;
}

export async function readFileSlice(
  absPath: string,
  startLine?: number,
  endLine?: number,
): Promise<string> {
  const raw = await readFile(absPath, 'utf8');
  if (!startLine && !endLine) return raw;
  const lines = raw.split('\n');
  const from = Math.max(1, startLine ?? 1);
  const to = Math.min(lines.length, endLine ?? lines.length);
  return lines
    .slice(from - 1, to)
    .map((l, i) => `${from + i}: ${l}`)
    .join('\n');
}
