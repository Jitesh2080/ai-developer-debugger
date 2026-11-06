import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pg from 'pg';
import { z } from 'zod';

/**
 * Database MCP server — READ-ONLY schema introspection and safe SQL analysis.
 * It never executes a user's query: validate_sql/explain_query only PLAN the
 * statement (EXPLAIN without ANALYZE) inside a READ ONLY transaction that is
 * always rolled back. Points at DB_MCP_URL, falling back to the app's DATABASE_URL.
 */
const connectionString = process.env.DB_MCP_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString, max: 3 });

const server = new McpServer({ name: 'database-mcp', version: '0.1.0' });
const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

/** Reject anything that could chain/execute beyond a single read-only plan. */
function assertSingleStatement(sql: string): void {
  const trimmed = sql.trim().replace(/;$/, '');
  if (trimmed.includes(';')) {
    throw new Error('Only a single statement may be analyzed.');
  }
  if (/\banalyze\b/i.test(sql)) {
    throw new Error('EXPLAIN ANALYZE is not allowed (it would execute the query).');
  }
}

/** Run a function inside a READ ONLY transaction that is always rolled back. */
async function inReadOnlyTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query('SET LOCAL statement_timeout = 5000');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

server.tool(
  'get_schema',
  'List the tables in the database (public schema) with their column counts.',
  {},
  async () => {
    const { rows } = await pool.query<{ table_name: string; columns: string }>(
      `SELECT t.table_name,
              (SELECT count(*)::text FROM information_schema.columns c
                WHERE c.table_schema='public' AND c.table_name=t.table_name) AS columns
         FROM information_schema.tables t
        WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
        ORDER BY t.table_name`,
    );
    if (rows.length === 0) return text('No tables found in the public schema.');
    return text(rows.map((r) => `${r.table_name} (${r.columns} columns)`).join('\n'));
  },
);

server.tool(
  'get_table_schema',
  'Describe a table: its columns, types, nullability, defaults, and primary key.',
  { table: z.string() },
  async ({ table }) => {
    const cols = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1
        ORDER BY ordinal_position`,
      [table],
    );
    if (cols.rows.length === 0) return text(`Table "${table}" not found.`);

    const pk = await pool.query<{ column_name: string }>(
      `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
        WHERE tc.table_schema='public' AND tc.table_name=$1
          AND tc.constraint_type='PRIMARY KEY'`,
      [table],
    );
    const pkCols = new Set(pk.rows.map((r) => r.column_name));

    const lines = cols.rows.map((c) => {
      const flags = [
        c.is_nullable === 'NO' ? 'NOT NULL' : null,
        pkCols.has(c.column_name) ? 'PK' : null,
        c.column_default ? `default ${c.column_default}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      return `  ${c.column_name} ${c.data_type}${flags ? ` [${flags}]` : ''}`;
    });
    return text(`Table "${table}":\n${lines.join('\n')}`);
  },
);

server.tool(
  'get_column_info',
  'Detailed info for a single column (type, length, precision, nullability, default).',
  { table: z.string(), column: z.string() },
  async ({ table, column }) => {
    const { rows } = await pool.query(
      `SELECT data_type, character_maximum_length, numeric_precision,
              numeric_scale, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      [table, column],
    );
    if (rows.length === 0) return text(`Column "${table}.${column}" not found.`);
    return text(JSON.stringify(rows[0], null, 2));
  },
);

server.tool(
  'validate_sql',
  'Check whether a single SQL statement is valid WITHOUT executing it (plans it only). Returns "valid" or the parser/planner error.',
  { sql: z.string() },
  async ({ sql }) => {
    try {
      assertSingleStatement(sql);
      await inReadOnlyTx((c) => c.query(`EXPLAIN ${sql}`));
      return text('SQL is valid (parsed and planned successfully).');
    } catch (err) {
      return text(`Invalid SQL: ${(err as Error).message}`);
    }
  },
);

server.tool(
  'explain_query',
  'Return the query plan for a single SQL statement WITHOUT executing it (EXPLAIN, no ANALYZE).',
  { sql: z.string() },
  async ({ sql }) => {
    try {
      assertSingleStatement(sql);
      const plan = await inReadOnlyTx((c) =>
        c.query<{ 'QUERY PLAN': string }>(`EXPLAIN (FORMAT TEXT) ${sql}`),
      );
      return text(plan.rows.map((r) => r['QUERY PLAN']).join('\n'));
    } catch (err) {
      return text(`Could not explain query: ${(err as Error).message}`);
    }
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('[database-mcp] fatal', err);
  pool.end().finally(() => process.exit(1));
});
