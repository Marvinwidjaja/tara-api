# TARA backend

The API for the TARA app (`../TARA`): parent and **caregiver accounts**, goals, activities,
assignments, in-app messages, and daily/weekly reports.

**TypeScript · Express 5 · PostgreSQL** (node-postgres) · zod validation.

## Quick start

Requirements: Node 22+ and PostgreSQL 14+ (`brew install postgresql@18 && brew services start postgresql@18`).

```bash
npm install
cp .env.example .env              # defaults to postgres://localhost:5432/cocare
npm run db:create                 # creates the "cocare" and "cocare_test" databases
npm run migrate                   # creates the tables (the server also does this on start)
npm run seed                      # optional: demo family (logins below)
npm run dev                       # http://localhost:4000, restarts on file changes
```

Then start the app: in `../TARA`, `npm start`. It always talks to this backend (port 4000).

**API docs:** open <http://localhost:4000/docs> for Swagger UI (try requests in the browser), or
fetch the raw OpenAPI 3.1 document from <http://localhost:4000/openapi.json>.

After `npm run seed`, sign in to the app as the parent `jordan@demo.cocare`, or as the caregivers
`rosa@demo.cocare` and `li@demo.cocare` (password `demo1234` for all). Tita Joy hasn't joined
yet: the seed prints her invite code, which you can use on the app's **Join with an invite code** screen.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run from source with reload (tsx) |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled server |
| `npm run migrate` | Apply new files in `migrations/` (each once, in a transaction) |
| `npm run seed` | Load the demo family (replaces only the demo account) |
| `npm test` | API tests against the database in `.env.test` (it is wiped first) |
| `npm run typecheck` | Type-check source and tests |
| `npm run sync-shared` | Copy shared code from the app (runs automatically before dev, build and test; see below) |

For tests, create `.env.test` with `DATABASE_URL=postgres://localhost:5432/cocare_test`. The
suite refuses to run against a database whose name doesn't contain "test".

## Deploy to Vercel (with a Neon database)

The API runs on Vercel as one function: Vercel imports `src/index.ts` and runs its default-exported
Express app. The web app (`../TARA`) is a second Vercel project; see its README.

**1. Database (Neon).** This folder is linked to the Neon project **TARA** (`.neon`, `neon.ts`),
branch `production`. `neon deploy` (or `neon env pull`) writes two connection strings into `.env`:

- `DATABASE_URL`, the **pooled** one (host has `-pooler`), used by the app for every query.
- `DATABASE_URL_UNPOOLED`, the **direct** one, used only by `npm run migrate`. The migration lock
  is session state, which the pooler doesn't keep.

Note that this makes `npm run dev` use Neon too. To develop against local Postgres instead, set
`DATABASE_URL=postgres://localhost:5432/cocare` and remove `DATABASE_URL_UNPOOLED`.

**2. Create the API project and its settings** (from this folder; the Vercel CLI works without git):

```bash
npx vercel link                                       # create a new project, e.g. "tara-api"
npx vercel env add DATABASE_URL production            # the value of DATABASE_URL in .env (pooled)
npx vercel env add DATABASE_URL_UNPOOLED production   # the value of DATABASE_URL_UNPOOLED in .env (direct)
npx vercel env add CRON_SECRET production             # a random string, e.g. from: openssl rand -hex 24
```

Alternatively, connect the Neon project to the Vercel project with Neon's Vercel integration, which
sets both variables for you.

**3. Deploy.**

```bash
npx vercel --prod
```

The build (`npm run vercel-build`) type-checks and applies `migrations/` to the database (only for
production deployments, so previews never touch it). Check `https://<api>.vercel.app/health` and
`/docs`. If the tables are missing, run `npm run migrate` from your machine (it uses `.env`, i.e.
Neon). Optional demo data: `npm run seed`.

**4. Deploy the app** (`../TARA`, see its README) with `EXPO_PUBLIC_API_URL=https://<api>.vercel.app`.
Optionally lock CORS to it afterwards: `npx vercel env add CORS_ORIGINS production` →
`https://<app>.vercel.app`, then `npx vercel --prod` again.

**On Vercel, compared with running it yourself:**

- The missing-report check runs **once a day** (Vercel cron, `vercel.json`: 13:00 UTC, give or take
  an hour, the Hobby plan's limit) instead of every 10 minutes. Vercel calls `GET /api/cron/sweep`
  with `CRON_SECRET`; without that variable the route is closed.
- `public/` (the docs logo) is served by Vercel's CDN; Swagger UI loads from jsDelivr.
- Settings come only from the project's Environment Variables; `.env` is never uploaded (`.vercelignore`).
- The free Hobby plan is for non-commercial use.

To deploy on every push instead, put this folder in a Git repository, push it to GitHub and import
it in Vercel (no other changes needed).

## How caregivers get in

1. The parent adds a caregiver (name, language, days, what they may see; phone is optional).
2. The parent makes an **invite code** (`POST /api/caregivers/:id/invite`). It works once and for
   `INVITE_DAYS` days. The app lets the parent share it (share sheet, copy code, or copy a join link).
3. The caregiver opens the link, or picks **I'm a caregiver → Join with an invite code**, and
   chooses their email and password (`POST /api/auth/caregiver/join`). From then on they sign in with
   `POST /api/auth/caregiver/login`.
4. A forgotten password: the parent makes a new code and the caregiver joins again with it, which
   replaces their email and password and ends their other sessions.
5. The parent can **pause** a caregiver (`PATCH /api/caregivers/:id {paused: true}`): they're signed
   out and can't sign in until resumed.

Caregiver sessions only open `/api/caregiver/*`; parent sessions open everything else.

## Configuration (`.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 4000 | Port to listen on |
| `DATABASE_URL` | `postgres://localhost:5432/cocare` | PostgreSQL connection string for the app (on Neon: the pooled one) |
| `DATABASE_URL_UNPOOLED` | (DATABASE_URL) | Direct connection string for migrations (on Neon: no `-pooler`) |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins (auth is a bearer token, not cookies) |
| `SESSION_DAYS` | 30 | How long a sign-in lasts (parents and caregivers) |
| `INVITE_DAYS` | 14 | How long a caregiver invite code works |
| `AUTO_NUDGE` | false | Post one in-app reminder ~1 h after an activity's time if there's no report |
| `DB_POOL_MAX` | 10 (3 on Vercel) | Database connections per server instance |
| `CRON_SECRET` | (none) | Vercel cron secret for `GET /api/cron/sweep`; unset = route closed |
| `API_DOCS` | true | Serve Swagger UI at `/docs` and the OpenAPI document at `/openapi.json` |

Settings are validated at startup. A bad value stops the server with a clear message.

## API

Full, interactive reference: **Swagger UI at `/docs`** (OpenAPI 3.1 at `/openapi.json`). To try
authenticated calls there, run `POST /api/auth/login` (or signup), copy the `token`, click
**Authorize** and paste it. The summary:

All `/api` routes except auth and `/api/library` need `Authorization: Bearer <token>`: a caregiver
token for `/api/caregiver/*`, a parent token for the rest.
Errors are `{ "error": "message" }` with a meaningful status (400, 401, 404, 409). Response shapes
are the types in `src/shared/types.ts`.

| Method & path | Purpose |
| --- | --- |
| `POST /api/auth/signup` · `POST /api/auth/login` · `POST /api/auth/logout` | Parent accounts (rate-limited); logout works for both |
| `GET /api/auth/invite/:code` · `POST /api/auth/caregiver/join` · `POST /api/auth/caregiver/login` | Caregiver accounts (rate-limited) |
| `GET /api/me` · `PATCH /api/me` | Parent profile (name, phone, child, time zone) |
| `GET /api/bootstrap` | Parent, today's date, caregivers, goals, activities, open alerts |
| `POST /api/caregivers` · `PATCH`/`DELETE /api/caregivers/:id` | Caregivers (`paused` to pause access) |
| `POST /api/caregivers/:id/invite` | Make a new invite code |
| `GET`/`POST /api/caregivers/:id/messages` | Chat with a caregiver |
| `POST /api/goals` · `PATCH`/`DELETE /api/goals/:id` | Goals |
| `POST /api/activities` · `POST /api/activities/from-library` · `PATCH`/`DELETE /api/activities/:id` | Activities |
| `GET /api/assignments?from&to` · `POST /api/assignments` · `PATCH`/`DELETE /api/assignments/:id` | Assignments (two-per-shift guard with `allowMore`) |
| `POST /api/assignments/:id/nudge` | Post a quick reminder in the caregiver's chat |
| `PATCH /api/alerts/:id` | Mark an inbox item handled |
| `GET`/`PATCH /api/day-logs/:date` | Nap, illness, notes |
| `GET /api/reports/daily?date` · `GET /api/reports/weekly?end` | Reports |
| `GET`/`PATCH /api/caregiver/me` | Caregiver: themselves, their family, unread count / change language |
| `GET /api/caregiver/day?date` | Caregiver: that day's activities in their language (+ goals, handoff if shared) |
| `PATCH /api/caregiver/assignments/:id` | Caregiver: done / skipped / changed / undo, reaction, note |
| `PATCH /api/caregiver/day-log` | Caregiver: today's nap, or "seems unwell" (alerts the parent) |
| `GET`/`POST /api/caregiver/messages` | Caregiver: chat with the parent |
| `GET /api/library` · `GET /health` | Public |
| `GET /api/cron/sweep` | Missing-report check, for the Vercel cron (`Authorization: Bearer <CRON_SECRET>`) |

## Project layout

```
migrations/          SQL migrations (001_init.sql = schema, 002 = caregiver accounts)
src/index.ts         entry: exports the app for Vercel; locally migrates, listens, runs the sweep
src/create-app.ts    Express app (helmet, CORS, parsers, docs page, routes, errors)
public/brand/        logo and favicon for the docs page
vercel.json          Vercel cron for the missing-report sweep
src/config.ts        env loading and validation
src/validation.ts    request schemas (zod)
src/db/              pool + helpers, migration runner, row mappers, demo seed
src/middleware/      auth (scrypt passwords, hashed session tokens), error handling
src/routes/          auth, caregivers (parent side), caregiver-app (caregiver side), plan, reports
src/services/        workflow (caregiver day, reports from caregivers, messages, reminders, reports)
src/docs/            OpenAPI document (openapi.ts) and response schemas (schemas.ts)
src/shared/          synced from the app, don't edit here
test/api.test.ts     end-to-end API tests
test/openapi.test.ts checks the docs: valid spec, every route exists, responses match the schemas
```

### Keeping the docs accurate

The OpenAPI document is generated from code, so it changes with the API:

- **Request bodies** are converted from the same zod schemas the routes validate with
  (`src/validation.ts`). Add `.meta({ description, example })` there to document a field.
- **Response bodies** are zod schemas in `src/docs/schemas.ts`. Each is compared at compile time
  with the matching type in `src/shared/types.ts`, so `npm run typecheck` fails if they disagree.
- **Paths** are listed in `src/docs/openapi.ts`. When you add a route, add it there too.
  `npm test` fails if a documented route doesn't exist, or if a real response doesn't match its
  documented schema.

### Shared code with the app

`src/shared/` (message classifier, translated texts, activity library, report
builders, API types) is the same code the app uses, so both sides agree on API shapes and on
how messages and reports read. The app's copy (`../TARA/src/shared`) is the source of truth.

It's copied here automatically before `npm run dev`, `npm run build` and `npm test` (adding the
`.js` import extensions Node needs). Run `npm run sync-shared` to copy it by hand, or
`npm run sync-shared -- --check` to fail if the two copies differ (useful in CI). Where the app
folder isn't present, as on a deployed server, the sync step is skipped and the copy here is used.

## Security notes

- Passwords: scrypt with a random salt per account. Sessions: random 256-bit tokens; only their
  SHA-256 hash is stored, and they expire after `SESSION_DAYS`.
- Every query is scoped to the signed-in parent's family, and caregiver routes to the caregiver's
  own activities; tests check one family can't read or change another's data and caregiver tokens
  can't use parent routes (or the other way round).
- Invite codes are random, single-use, expire, and skip look-alike characters. Join, sign-in,
  sign-up and invite lookups are rate-limited.
- All SQL is parameterized. Request bodies are validated and size-limited.
