/**
 * Minimal migration runner: applies migrations/*.sql in name order, each once, in a transaction,
 * and records them in `schema_migrations`. Run with `npm run migrate`.
 *
 * Uses its own direct connection (DATABASE_URL_UNPOOLED on Neon), not the app's pooled one: the
 * advisory lock below is session state, which a transaction-mode pooler doesn't keep.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { config } from '../config.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export async function migrate({ quiet = false } = {}) {
  const client = new pg.Client({ connectionString: config.DATABASE_URL_UNPOOLED ?? config.DATABASE_URL });
  await client.connect();
  try {
    // Serialize concurrent runs (e.g. two servers starting at once).
    await client.query('SELECT pg_advisory_lock(727272)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
    );
    const applied = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        if (!quiet) console.log(`applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
    }
    if (!quiet) console.log('migrations up to date');
  } finally {
    await client.query('SELECT pg_advisory_unlock(727272)').catch(() => {});
    await client.end();
  }
}

// CLI: `npm run migrate`. With --deploy (used by `npm run vercel-build`) it only runs for
// Vercel production deployments, so preview deployments never change the production database.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--deploy') && process.env.VERCEL_ENV !== 'production') {
    console.log(`[migrate] skipped: not a production deployment (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'})`);
    process.exit(0);
  }
  migrate().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
