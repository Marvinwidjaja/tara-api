/**
 * Configuration from environment variables (and `.env` if present), validated at startup so a
 * typo fails loudly instead of half-working.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, process.env.NODE_ENV === 'test' ? '.env.test' : '.env');
// On Vercel, settings come from the project's Environment Variables, never from a file.
if (!process.env.VERCEL && existsSync(envFile)) process.loadEnvFile(envFile);

/**
 * Neon's connection strings say `sslmode=require`. pg currently treats that as `verify-full` (check
 * the certificate and host name) but warns it will weaken it to libpq's "encrypt only" in pg v9, so
 * ask for `verify-full` explicitly: same behavior today, no warning, no silent downgrade later.
 */
const strictSsl = (url: string | undefined) => url?.replace(/([?&]sslmode=)require\b/, '$1verify-full');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** App queries. On Neon: the pooled connection string (host has `-pooler`). */
  DATABASE_URL: z.string().trim().min(1).default('postgres://localhost:5432/cocare').transform((v) => strictSsl(v)!),
  /**
   * Migrations. On Neon: the direct connection string (no `-pooler`), since the pooler doesn't
   * keep session state such as the migration lock. Unset = use DATABASE_URL (fine for local Postgres).
   */
  DATABASE_URL_UNPOOLED: z
    .string()
    .trim()
    .optional()
    .transform((v) => strictSsl(v || undefined)),
  /** Connections per server instance. Keep it small on Vercel, where many instances can run at once. */
  DB_POOL_MAX: z.coerce.number().int().positive().default(process.env.VERCEL ? 3 : 10),
  /** Comma-separated origins allowed by CORS; "*" allows any (fine for token auth, no cookies). */
  CORS_ORIGINS: z.string().default('*'),
  SESSION_DAYS: z.coerce.number().int().positive().default(30),
  /** How long a caregiver invite code works. */
  INVITE_DAYS: z.coerce.number().int().positive().default(14),

  /** Serve Swagger UI at /docs and the OpenAPI document at /openapi.json. */
  API_DOCS: z.stringbool().default(true),

  /** Post one in-app reminder ~1 h after an activity's time if there's no report. */
  AUTO_NUDGE: z.stringbool().default(false),
  /** Vercel cron: the secret Vercel sends to GET /api/cron/sweep. Unset = that route is closed. */
  CRON_SECRET: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid configuration:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
