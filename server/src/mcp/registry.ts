import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServerClient, type McpToolResult } from './client.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Per-investigation context passed to the MCP servers at spawn time. */
export interface McpContext {
  projectId: string;
  /** Local filesystem path of the cloned repo (for the github server). */
  repoPath?: string;
}

/** A tool as exposed to the agent, annotated with which server owns it. */
export interface AggregatedTool {
  server: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ServerSpec {
  name: string;
  /** Module directory under src/mcp/servers containing index.ts. */
  dir: string;
  /** Extra env vars this server needs, derived from the context. */
  env: (ctx: McpContext) => Record<string, string>;
}

const SERVERS: ServerSpec[] = [
  {
    name: 'github',
    dir: 'github',
    env: (ctx): Record<string, string> =>
      ctx.repoPath ? { REPO_PATH: ctx.repoPath } : {},
  },
  {
    name: 'docs',
    dir: 'docs',
    env: (ctx) => ({ PROJECT_ID: ctx.projectId }),
  },
  {
    name: 'database',
    dir: 'database',
    env: () => ({}), // reads DB_MCP_URL / DATABASE_URL from the inherited env
  },
  {
    name: 'logs',
    dir: 'logs',
    env: () => ({}), // reads LOGS_DIR from the inherited env
  },
];

/**
 * Resolves how to launch a server module: under tsx in development (entry is a
 * .ts file) or plain node against the compiled output in production.
 */
function launchFor(serverDir: string): { command: string; args: string[] } {
  const runningFromSource = __dirname.includes(`${join('src', 'mcp')}`);
  if (runningFromSource) {
    const entry = join(__dirname, 'servers', serverDir, 'index.ts');
    const tsxPkg = require.resolve('tsx/package.json');
    const pkg = JSON.parse(readFileSync(tsxPkg, 'utf8')) as {
      bin: string | Record<string, string>;
    };
    const binRel =
      (typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.tsx) ?? 'dist/cli.mjs';
    const tsxBin = join(dirname(tsxPkg), binRel);
    return { command: process.execPath, args: [tsxBin, entry] };
  }
  const entry = join(__dirname, 'servers', serverDir, 'index.js');
  return { command: process.execPath, args: [entry] };
}

/** Only forward defined string env vars to child servers. */
function cleanEnv(extra: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') base[k] = v;
  }
  return { ...base, ...extra };
}

/**
 * The MCP host: spawns the configured MCP servers, aggregates their tool
 * catalogs for the agent, and routes tool calls to the owning server.
 */
export class McpRegistry {
  private clients = new Map<string, McpServerClient>();
  private toolToServer = new Map<string, string>();
  private tools: AggregatedTool[] = [];

  async connectAll(ctx: McpContext): Promise<void> {
    for (const spec of SERVERS) {
      // The github server is only useful with a cloned repo.
      if (spec.name === 'github' && !ctx.repoPath) continue;

      const client = new McpServerClient(spec.name);
      const { command, args } = launchFor(spec.dir);
      await client.connect({ command, args, env: cleanEnv(spec.env(ctx)) });
      this.clients.set(spec.name, client);

      const descriptors = await client.listTools();
      for (const d of descriptors) {
        this.toolToServer.set(d.name, spec.name);
        this.tools.push({ server: spec.name, ...d });
      }
    }
  }

  listTools(): AggregatedTool[] {
    return this.tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult & { server: string }> {
    // Some models prefix tool names (e.g. "repo_browser.list_files"); fall back
    // to matching the final segment against a known tool.
    let resolvedName = name;
    let server = this.toolToServer.get(resolvedName);
    if (!server && name.includes('.')) {
      const suffix = name.slice(name.lastIndexOf('.') + 1);
      if (this.toolToServer.has(suffix)) {
        resolvedName = suffix;
        server = this.toolToServer.get(suffix);
      }
    }
    if (!server) {
      return { server: 'unknown', isError: true, text: `Unknown tool: ${name}` };
    }
    const client = this.clients.get(server)!;
    const result = await client.callTool(resolvedName, args);
    return { server, ...result };
  }

  async close(): Promise<void> {
    await Promise.all([...this.clients.values()].map((c) => c.close()));
    this.clients.clear();
    this.toolToServer.clear();
    this.tools = [];
  }
}
