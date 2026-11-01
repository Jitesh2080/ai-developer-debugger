import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getRepoRoot, git, readFileSlice, safeResolve } from './repo.js';

/**
 * GitHub/Git MCP server — read-only tools that let the agent investigate a
 * locally cloned repository's source and history. Exposed over stdio.
 */
const server = new McpServer({ name: 'github-mcp', version: '0.1.0' });

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

/** Clamp a model-supplied numeric arg into a safe range (schemas are kept
 * permissive so strict backends like Groq don't reject slightly-off values). */
const clamp = (n: number | undefined, def: number, min: number, max: number) =>
  Math.min(Math.max(Math.floor(n ?? def), min), max);

server.tool(
  'search_code',
  'Search the repository source code for a pattern (ripgrep-style via git grep). Returns matching file:line:text.',
  {
    query: z.string().describe('Substring or regex to search for'),
    maxResults: z.number().optional().describe('Max matches (default 40)'),
    ignoreCase: z.boolean().optional(),
  },
  async ({ query, maxResults, ignoreCase = true }) => {
    const limit = clamp(maxResults, 40, 1, 100);
    const args = ['grep', '-n', '-I', '--no-color'];
    if (ignoreCase) args.push('-i');
    args.push('-e', query);
    try {
      const out = await git().raw(args);
      const lines = out.split('\n').filter(Boolean).slice(0, limit);
      if (lines.length === 0) return text(`No matches for "${query}".`);
      return text(lines.join('\n'));
    } catch {
      // git grep exits non-zero when there are no matches.
      return text(`No matches for "${query}".`);
    }
  },
);

server.tool(
  'get_file',
  'Read a file from the repository, optionally a line range. Paths are relative to the repo root.',
  {
    path: z.string(),
    startLine: z.number().optional(),
    endLine: z.number().optional(),
  },
  async ({ path, startLine, endLine }) => {
    const abs = safeResolve(getRepoRoot(), path);
    try {
      const content = await readFileSlice(
        abs,
        startLine ? clamp(startLine, 1, 1, 1_000_000) : undefined,
        endLine ? clamp(endLine, 1, 1, 1_000_000) : undefined,
      );
      return text(content || '(empty file)');
    } catch (err) {
      return text(`Could not read ${path}: ${(err as Error).message}`);
    }
  },
);

server.tool(
  'list_files',
  'List git-tracked files in the repository, optionally filtered by a path prefix.',
  {
    prefix: z.string().optional().describe('Only list files under this path'),
    maxResults: z.number().optional().describe('Max files (default 300)'),
  },
  async ({ prefix, maxResults }) => {
    const limit = clamp(maxResults, 300, 1, 1000);
    const out = await git().raw(['ls-files']);
    let files = out.split('\n').filter(Boolean);
    if (prefix) files = files.filter((f) => f.startsWith(prefix));
    const shown = files.slice(0, limit);
    const suffix =
      files.length > shown.length
        ? `\n... (${files.length - shown.length} more)`
        : '';
    return text(shown.join('\n') + suffix || '(no files)');
  },
);

server.tool(
  'get_recent_commits',
  'List the most recent commits (sha, author, date, subject).',
  { limit: z.number().optional().describe('Number of commits (default 10)') },
  async ({ limit }) => {
    const log = await git().log({ maxCount: clamp(limit, 10, 1, 50) });
    const lines = log.all.map(
      (c) =>
        `${c.hash.slice(0, 10)}  ${c.date}  ${c.author_name}\n    ${c.message}`,
    );
    return text(lines.join('\n\n') || '(no commits)');
  },
);

server.tool(
  'get_commit',
  'Show a single commit: metadata and the files it changed (--stat).',
  { sha: z.string() },
  async ({ sha }) => {
    try {
      const out = await git().show([sha, '--stat', '--no-color']);
      return text(out);
    } catch (err) {
      return text(`Could not show commit ${sha}: ${(err as Error).message}`);
    }
  },
);

server.tool(
  'get_git_diff',
  'Show the diff introduced by a commit (git show), optionally limited to one file path.',
  {
    sha: z.string().describe('Commit SHA or ref whose diff to show'),
    path: z.string().optional().describe('Limit the diff to this file'),
  },
  async ({ sha, path }) => {
    const args = [sha, '--no-color'];
    if (path) args.push('--', path);
    try {
      const out = await git().show(args);
      // Guard against enormous diffs overwhelming the context window.
      const capped =
        out.length > 12_000 ? out.slice(0, 12_000) + '\n... (diff truncated)' : out;
      return text(capped);
    } catch (err) {
      return text(`Could not diff ${sha}: ${(err as Error).message}`);
    }
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('[github-mcp] fatal', err);
  process.exit(1);
});
