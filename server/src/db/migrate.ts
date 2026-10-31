import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { pool, closePool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * Applies any *.sql migration files that have not yet been recorded, in
 * filename order. Each migration runs inside a transaction and is recorded in
 * schema_migrations so re-running is idempotent.
 */
async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows } = await pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations',
  );
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] skip ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    // Substitute build-time placeholders (e.g. the embedding vector dimension).
    const prepared = sql.replaceAll(
      '__EMBEDDING_DIM__',
      String(env.EMBEDDING_DIMENSIONS),
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(prepared);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
        file,
      ]);
      await client.query('COMMIT');
      console.log(`[migrate] applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] FAILED ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('[migrate] done');
}

migrate()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    closePool().finally(() => process.exit(1));
  });
