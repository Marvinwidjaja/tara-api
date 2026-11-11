/**
 * PostgreSQL connection pool and small query helpers (node-postgres). On Neon, DATABASE_URL is the
 * pooled (PgBouncer) connection string, so each query or transaction() can land on any server
 * connection; don't rely on session state (SET, advisory locks) here. migrate.ts uses its own
 * direct connection for that.
 */
import { attachDatabasePool } from '@vercel/functions';
import pg from 'pg';

import { config } from '../config.js';

// Return DATE columns as plain 'YYYY-MM-DD' strings (not JS Dates shifted by the server time zone).
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DB_POOL_MAX,
  // Close idle connections quickly so serverless instances don't hold them open.
  idleTimeoutMillis: 10_000,
});

pool.on('error', (err) => console.error('[db] idle client error', err));

// On Vercel (Fluid compute), keep the function alive just long enough to close idle connections
// before it's suspended, so they aren't leaked. Does nothing anywhere else.
attachDatabasePool(pool);

export type Queryable = Pick<pg.PoolClient, 'query'>;

export async function many<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  db: Queryable = pool
) {
  return (await db.query<T>(sql, params)).rows;
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  db: Queryable = pool
): Promise<T | undefined> {
  return (await db.query<T>(sql, params)).rows[0];
}

export async function exec(sql: string, params: unknown[] = [], db: Queryable = pool) {
  return (await db.query(sql, params)).rowCount ?? 0;
}

/** Runs `fn` in a transaction; rolls back if it throws. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Builds `SET a = $2, b = $3` from the fields that were provided (undefined = leave unchanged).
 * Column names come from code, never from user input.
 */
export function setClause(fields: Record<string, unknown>, firstIndex: number) {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  return {
    sql: entries.map(([column], i) => `${column} = $${firstIndex + i}`).join(', '),
    values: entries.map(([, v]) => v),
    empty: entries.length === 0,
  };
}
