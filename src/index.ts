/**
 * Entry point, in two modes:
 *
 * - On Vercel (`VERCEL` is set), Vercel imports this file and runs the default-exported app as
 *   a function. Migrations run at deploy time (`npm run vercel-build`) and the missing-report
 *   sweep runs as a cron job (vercel.json → GET /api/cron/sweep).
 * - Anywhere else (`npm run dev`, `npm start`), it applies migrations, listens on PORT and runs
 *   the sweep every 10 minutes itself.
 */
import express from 'express';

import { createApp } from './create-app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { sweepMissingReports } from './services/workflow.js';

// Created here (not inside createApp) because Vercel's Express detection looks for the entry
// file that imports express.
const app = createApp(express());
export default app;

if (!process.env.VERCEL) await startServer();

async function startServer() {
  await migrate({ quiet: true });

  const server = app.listen(config.PORT, '0.0.0.0', (err?: Error) => {
    if (err) {
      console.error(
        (err as NodeJS.ErrnoException).code === 'EADDRINUSE'
          ? `Port ${config.PORT} is already in use: another TARA server (or other app) is running. Stop it first.`
          : `Could not start the server: ${err.message}`
      );
      process.exit(1);
    }
    console.log(`TARA API on http://localhost:${config.PORT}`);
    if (config.API_DOCS) console.log(`API docs: http://localhost:${config.PORT}/docs`);
  });

  // "No report → one quick reminder, then tell parent": check every 10 minutes.
  const sweep = () =>
    sweepMissingReports({ autoNudge: config.AUTO_NUDGE }).catch((err) => console.error('[sweep]', err));
  const interval = setInterval(sweep, 10 * 60_000);
  setTimeout(sweep, 5_000).unref();

  const shutdown = (signal: string) => {
    console.log(`${signal}: shutting down`);
    clearInterval(interval);
    server.close(() => void pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
