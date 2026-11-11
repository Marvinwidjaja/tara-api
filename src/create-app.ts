/**
 * The Express app (no listening here, so tests can drive it with supertest and Vercel can run it
 * as a function; see src/index.ts).
 */
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import * as helmetModule from 'helmet';
import type { HelmetOptions } from 'helmet';

import { config } from './config.js';
import { pool } from './db/pool.js';
import { openapi } from './docs/openapi.js';
import { errorHandler, HttpError, notFound } from './middleware/errors.js';
import { authRouter, meRouter } from './routes/auth.js';
import { caregiverAppRouter } from './routes/caregiver-app.js';
import { caregiversRouter } from './routes/caregivers.js';
import { activitiesRouter, assignmentsRouter, goalsRouter } from './routes/plan.js';
import { familyRouter, publicRouter } from './routes/reports.js';
import { sweepMissingReports } from './services/workflow.js';

// At runtime `.default` is the helmet function in both its ESM and CJS builds. Its types differ:
// Vercel's Express build type-checks imports against helmet's CJS typings, where a default import
// (and `.default`) is the module object, so name the call signature here instead.
const helmet = (helmetModule as unknown as { default: (options?: Readonly<HelmetOptions>) => RequestHandler }).default;

const requestLog: RequestHandler = (req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (config.NODE_ENV !== 'test' && req.path !== '/health') {
      console.log(`${req.method} ${req.originalUrl.split('?')[0]} → ${res.statusCode} (${Date.now() - started}ms)`);
    }
  });
  next();
};

/** Swagger UI version loaded from the CDN for /docs. */
const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.34.1';

/**
 * The /docs page: Swagger UI from a CDN, pointed at /openapi.json. (Vercel doesn't serve files
 * through express.static, so the UI can't come from node_modules.)
 */
const docsPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TARA API docs</title>
  <link rel="icon" href="/brand/favicon.png" />
  <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
  <style>
    body { margin: 0; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .main::before {
      content: '';
      display: block;
      width: 96px;
      height: 107px;
      margin-bottom: 12px;
      background: url('/brand/tara-logo.png') no-repeat left center / contain;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${SWAGGER_UI}/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      persistAuthorization: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
    });
  </script>
</body>
</html>`;

/** Sets up routes and middleware on `app` (a fresh Express app by default) and returns it. */
export function createApp(app: Express = express()) {
  app.disable('x-powered-by');
  // Behind Vercel / ngrok / a load balancer: trust X-Forwarded-* for client IPs (rate limiting).
  app.set('trust proxy', 1);

  // Logo and favicon for the docs page. On Vercel, files in public/ are served by the CDN
  // before a request reaches Express; locally Express serves them.
  app.use('/brand', express.static(fileURLToPath(new URL('../public/brand', import.meta.url)), { maxAge: '7d' }));

  // API docs: Swagger UI at /docs, raw OpenAPI 3.1 at /openapi.json. Swagger UI needs a looser
  // Content-Security-Policy than the API, so it's mounted before the global helmet() below.
  if (config.API_DOCS) {
    const docsHelmet = helmet({ contentSecurityPolicy: false });
    app.get('/openapi.json', docsHelmet, (_req, res) => {
      res.json(openapi);
    });
    app.get('/docs', docsHelmet, (_req, res) => {
      res.type('html').send(docsPage);
    });
  }

  app.use(helmet());
  const origins = config.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.use(cors({ origin: origins.includes('*') ? '*' : origins }));
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLog);

  app.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });

  /**
   * "No report → one quick reminder, then tell parent". Locally src/index.ts runs this every 10
   * minutes; on Vercel a cron job calls it (see vercel.json) with `Authorization: Bearer <CRON_SECRET>`.
   */
  app.get('/api/cron/sweep', async (req, res) => {
    if (!config.CRON_SECRET || req.headers.authorization !== `Bearer ${config.CRON_SECRET}`) {
      throw new HttpError(401, 'Not allowed.');
    }
    await sweepMissingReports({ autoNudge: config.AUTO_NUDGE });
    res.json({ ok: true });
  });

  app.use('/api', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/caregiver', caregiverAppRouter);
  app.use('/api/caregivers', caregiversRouter);
  app.use('/api/goals', goalsRouter);
  app.use('/api/activities', activitiesRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api', familyRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
