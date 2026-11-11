/**
 * The OpenAPI 3.1 document for the TARA API, served at /openapi.json and as Swagger UI at /docs.
 *
 * Request bodies come straight from the zod schemas the routes validate with (src/validation.ts);
 * response bodies from src/docs/schemas.ts, which are type-checked against src/shared/types.ts.
 * test/openapi.test.ts checks every documented route exists and real responses match these schemas.
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';

import { ROUTINE_ANCHORS } from '../shared/library.js';
import * as v from '../validation.js';
import { registry } from './schemas.js';

type Json = Record<string, unknown>;

/** The API version from package.json (falls back if the file isn't bundled, e.g. in a serverless function). */
const version = (() => {
  try {
    return (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')) as { version: string }).version;
  } catch {
    return '1.0.0';
  }
})();

/**
 * Cleans up zod's JSON Schema for OpenAPI:
 * - drops `$schema` and `$id`. zod sets `$id: "#/components/schemas/X"` on registered schemas,
 *   but in OpenAPI 3.1 an `$id` changes the base that `$ref`s resolve against, which breaks
 *   `#/components/...` references in Swagger UI. The component name already comes from its key.
 * - drops long generated regexes (uuid, email) that only add noise next to `format`.
 */
function tidy(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tidy);
  if (!node || typeof node !== 'object') return node;
  const out: Json = {};
  for (const [k, value] of Object.entries(node)) {
    if (k === '$schema' || k === '$id') continue;
    if (k === 'pattern' && ('format' in node || String(value).length > 60)) continue;
    out[k] = tidy(value);
  }
  return out;
}

const schemaOf = (s: z.ZodType, io: 'input' | 'output' = 'input') =>
  tidy(z.toJSONSchema(s, { io, unrepresentable: 'any', target: 'draft-2020-12' })) as Json;

const componentSchemas = (() => {
  const { schemas } = z.toJSONSchema(registry, {
    io: 'output',
    unrepresentable: 'any',
    target: 'draft-2020-12',
    uri: (id) => `#/components/schemas/${id}`,
  });
  return tidy(schemas) as Record<string, Json>;
})();

const ref = (name: string) => {
  if (!componentSchemas[name]) throw new Error(`OpenAPI: unknown schema ${name}`);
  return { $ref: `#/components/schemas/${name}` };
};
const list = (name: string) => ({ type: 'array', items: ref(name) });

// ---------------------------------------------------------------------------
// Operation builder
// ---------------------------------------------------------------------------

type Op = {
  tag: string;
  summary: string;
  description?: string;
  /** false = public; 'optional' = sends the token if there is one but never answers 401. */
  auth?: boolean | 'optional';
  params?: Json[];
  body?: z.ZodType;
  ok: { status?: number; schema?: Json; description?: string; content?: Json };
  errors?: number[];
};

const ERROR_RESPONSES: Record<number, string> = {
  400: 'BadRequest',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'NotFound',
  409: 'Conflict',
  429: 'TooManyRequests',
};

function operation(id: string, op: Op) {
  const errors = new Set(op.errors ?? []);
  if (op.auth === undefined || op.auth === true) errors.add(401);
  if (op.body) errors.add(400);
  const responses: Json = {
    [op.ok.status ?? 200]: {
      description: op.ok.description ?? 'OK',
      content: op.ok.content ?? { 'application/json': { schema: op.ok.schema ?? ref('Ok') } },
    },
  };
  for (const code of [...errors].sort()) responses[code] = { $ref: `#/components/responses/${ERROR_RESPONSES[code]}` };
  return {
    operationId: id,
    tags: [op.tag],
    summary: op.summary,
    ...(op.description ? { description: op.description } : {}),
    ...(op.auth === false ? { security: [] } : op.auth === 'optional' ? { security: [{ bearerAuth: [] }, {}] } : {}),
    ...(op.params ? { parameters: op.params } : {}),
    ...(op.body
      ? { requestBody: { required: true, content: { 'application/json': { schema: schemaOf(op.body) } } } }
      : {}),
    responses,
  };
}

const idParam = (what: string) => ({
  name: 'id',
  in: 'path',
  required: true,
  description: `${what} id`,
  schema: { type: 'string', format: 'uuid' },
});
const dateParam = (name: string, where: 'path' | 'query', description: string, required = where === 'path') => ({
  name,
  in: where,
  required,
  description,
  schema: { type: 'string', format: 'date', example: '2026-11-10' },
});

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const codeParam = {
  name: 'code',
  in: 'path',
  required: true,
  description: 'Invite code (case, spaces and dashes don’t matter)',
  schema: { type: 'string', example: 'ABCD2345' },
};

const paths: Record<string, Record<string, Json>> = {
  '/health': {
    get: operation('health', { tag: 'System', summary: 'Health check (server and database)', auth: false, ok: { schema: ref('Health') } }),
  },
  '/api/library': {
    get: operation('listLibrary', {
      tag: 'Activities',
      summary: 'Reviewed activity library',
      description: 'Human-reviewed activities, translated into every caregiver language. Copy one with `POST /api/activities/from-library`.',
      auth: false,
      ok: { schema: list('LibraryItem') },
    }),
  },

  // --- Auth ---------------------------------------------------------------------
  '/api/auth/signup': {
    post: operation('signUp', {
      tag: 'Auth',
      summary: 'Create a parent account',
      description: 'Returns a session token. Send it as `Authorization: Bearer <token>`. Rate-limited to 20 attempts per 15 minutes per IP.',
      auth: false,
      body: v.signUp,
      ok: { status: 201, schema: ref('AuthResult'), description: 'Account created' },
      errors: [409, 429],
    }),
  },
  '/api/auth/login': {
    post: operation('signIn', {
      tag: 'Auth',
      summary: 'Sign in as a parent',
      description: 'Rate-limited to 20 attempts per 15 minutes per IP. Wrong email or password → 401.',
      auth: false,
      body: v.signIn,
      ok: { schema: ref('AuthResult') },
      errors: [401, 429],
    }),
  },
  '/api/auth/invite/{code}': {
    get: operation('previewInvite', {
      tag: 'Auth',
      summary: 'Who an invite code is from',
      description: 'For the join screen: “Jordan invited you to help with Mia”. Unknown or expired code → 404; paused caregiver → 403.',
      auth: false,
      params: [codeParam],
      ok: { schema: ref('InvitePreview') },
      errors: [403, 404, 429],
    }),
  },
  '/api/auth/caregiver/join': {
    post: operation('caregiverJoin', {
      tag: 'Auth',
      summary: 'Create a caregiver login with an invite code',
      description:
        'The code comes from the parent (`POST /api/caregivers/{id}/invite`) and works once. Using a new code on a caregiver who already joined replaces their email and password and signs them out elsewhere.',
      auth: false,
      body: v.caregiverJoin,
      ok: { status: 201, schema: ref('CaregiverAuthResult'), description: 'Joined' },
      errors: [403, 404, 409, 429],
    }),
  },
  '/api/auth/caregiver/login': {
    post: operation('caregiverSignIn', {
      tag: 'Auth',
      summary: 'Sign in as a caregiver',
      description: 'Wrong email or password → 401. Access paused by the parent → 403.',
      auth: false,
      body: v.signIn,
      ok: { schema: ref('CaregiverAuthResult') },
      errors: [401, 403, 429],
    }),
  },
  '/api/auth/logout': {
    post: operation('signOut', {
      tag: 'Auth',
      summary: 'Sign out (ends this session)',
      auth: 'optional',
      description: 'Ends the session (parent or caregiver) whose token is in the Authorization header. Always succeeds.',
      ok: { schema: ref('Ok') },
    }),
  },
  '/api/me': {
    get: operation('getMe', { tag: 'Auth', summary: 'The signed-in parent', ok: { schema: ref('Parent') } }),
    patch: operation('updateMe', {
      tag: 'Auth',
      summary: 'Update profile, child or time zone',
      description: 'Send only the fields to change. `phone: ""` removes the phone number.',
      body: v.updateMe,
      ok: { schema: ref('Parent') },
    }),
  },
  '/api/bootstrap': {
    get: operation('bootstrap', {
      tag: 'Family',
      summary: 'Everything the parent’s app needs on launch',
      description: 'Parent, today’s date in their time zone, caregivers, goals, activities and open alerts.',
      ok: { schema: ref('Bootstrap') },
    }),
  },

  // --- Caregivers (parent) ------------------------------------------------------
  '/api/caregivers': {
    post: operation('createCaregiver', {
      tag: 'Caregivers',
      summary: 'Add a caregiver',
      description: 'New caregivers start as `not-invited`. Make an invite code next and share it with them.',
      body: v.createCaregiver,
      ok: { status: 201, schema: ref('Caregiver'), description: 'Created' },
    }),
  },
  '/api/caregivers/{id}': {
    patch: operation('updateCaregiver', {
      tag: 'Caregivers',
      summary: 'Update a caregiver (details, consent, or pause their access)',
      params: [idParam('Caregiver')],
      body: v.updateCaregiver,
      ok: { schema: ref('Caregiver') },
      errors: [404],
    }),
    delete: operation('deleteCaregiver', {
      tag: 'Caregivers',
      summary: 'Remove a caregiver (and their login, assignments and messages)',
      params: [idParam('Caregiver')],
      ok: { schema: ref('Ok') },
    }),
  },
  '/api/caregivers/{id}/invite': {
    post: operation('inviteCaregiver', {
      tag: 'Caregivers',
      summary: 'Make a new invite code',
      description: `Replaces any earlier code. It works once, for INVITE_DAYS (default 14) days. The parent shares it themselves (copy, or a join link). Sets \`not-invited\` caregivers to \`invited\`.`,
      params: [idParam('Caregiver')],
      ok: { schema: ref('Caregiver') },
      errors: [404],
    }),
  },
  '/api/caregivers/{id}/messages': {
    get: operation('listMessages', {
      tag: 'Messages',
      summary: 'Chat with a caregiver (latest 200, oldest first)',
      description: 'Marks the caregiver’s messages as read.',
      params: [idParam('Caregiver')],
      ok: { schema: list('Message') },
      errors: [404],
    }),
    post: operation('sendMessage', {
      tag: 'Messages',
      summary: 'Message a caregiver',
      description: 'Shows up in the caregiver’s app as written (not translated).',
      params: [idParam('Caregiver')],
      body: v.message,
      ok: { status: 201, schema: ref('Message'), description: 'Sent' },
      errors: [404],
    }),
  },

  // --- Goals & activities -------------------------------------------------------
  '/api/goals': {
    post: operation('createGoal', {
      tag: 'Goals',
      summary: 'Add a goal',
      body: v.createGoal,
      ok: { status: 201, schema: ref('Goal'), description: 'Created' },
    }),
  },
  '/api/goals/{id}': {
    patch: operation('updateGoal', {
      tag: 'Goals',
      summary: 'Update a goal (set active: false to pause it)',
      params: [idParam('Goal')],
      body: v.updateGoal,
      ok: { schema: ref('Goal') },
      errors: [404],
    }),
    delete: operation('deleteGoal', {
      tag: 'Goals',
      summary: 'Delete a goal (linked activities are kept, unlinked)',
      params: [idParam('Goal')],
      ok: { schema: ref('Ok') },
    }),
  },
  '/api/activities': {
    post: operation('createActivity', {
      tag: 'Activities',
      summary: 'Write your own activity',
      description: 'Keep steps short. Shown to caregivers exactly as written. Empty steps are dropped; at most 8.',
      body: v.createActivity,
      ok: { status: 201, schema: ref('Activity'), description: 'Created' },
      errors: [404],
    }),
  },
  '/api/activities/from-library': {
    post: operation('addLibraryActivity', {
      tag: 'Activities',
      summary: 'Copy an activity from the reviewed library',
      description: 'Library activities are shown in each caregiver’s language. Each can be added once per family (409 after that).',
      body: v.fromLibrary,
      ok: { status: 201, schema: ref('Activity'), description: 'Created' },
      errors: [404, 409],
    }),
  },
  '/api/activities/{id}': {
    patch: operation('updateActivity', {
      tag: 'Activities',
      summary: 'Update an activity',
      description: 'Rewording a library activity (title or steps) clears `libraryId`: it’s then shown as written, not translated.',
      params: [idParam('Activity')],
      body: v.updateActivity,
      ok: { schema: ref('Activity') },
      errors: [404],
    }),
    delete: operation('deleteActivity', {
      tag: 'Activities',
      summary: 'Delete an activity (and its assignments)',
      params: [idParam('Activity')],
      ok: { schema: ref('Ok') },
    }),
  },

  // --- Assignments --------------------------------------------------------------
  '/api/assignments': {
    get: operation('listAssignments', {
      tag: 'Assignments',
      summary: 'Assignments in a date range',
      description: 'Defaults to today (in the parent’s time zone). `to` defaults to `from`.',
      params: [dateParam('from', 'query', 'First day (inclusive)'), dateParam('to', 'query', 'Last day (inclusive)')],
      ok: { schema: list('Assignment') },
      errors: [400],
    }),
    post: operation('createAssignment', {
      tag: 'Assignments',
      summary: 'Assign an activity to a caregiver',
      description:
        'Today or later only. The caregiver sees it in their app right away. A third activity for the same caregiver on the same day is refused with 409 (“one or two per shift”) unless `allowMore` is true.',
      body: v.createAssignment,
      ok: { status: 201, schema: ref('Assignment'), description: 'Created' },
      errors: [404, 409],
    }),
  },
  '/api/assignments/{id}': {
    patch: operation('updateAssignment', {
      tag: 'Assignments',
      summary: 'Update an assignment, or record its outcome',
      description: 'Setting `status` to done/skipped/changed records `reportedAt`. `reaction: null` clears the reaction.',
      params: [idParam('Assignment')],
      body: v.updateAssignment,
      ok: { schema: ref('Assignment') },
      errors: [404],
    }),
    delete: operation('deleteAssignment', {
      tag: 'Assignments',
      summary: 'Remove an assignment',
      params: [idParam('Assignment')],
      ok: { schema: ref('Ok') },
    }),
  },
  '/api/assignments/{id}/nudge': {
    post: operation('nudgeAssignment', {
      tag: 'Messages',
      summary: 'Post a quick “how did it go?” reminder in the caregiver’s chat',
      description: 'In the caregiver’s language. 400 if the activity already has a report.',
      params: [idParam('Assignment')],
      ok: { status: 201, schema: ref('Message'), description: 'Posted' },
      errors: [400, 404],
    }),
  },

  // --- Inbox, day logs, reports -------------------------------------------------
  '/api/alerts/{id}': {
    patch: operation('resolveAlert', {
      tag: 'Family',
      summary: 'Mark an inbox item handled (or reopen it)',
      params: [idParam('Alert')],
      body: v.resolveAlert,
      ok: { schema: ref('Ok') },
    }),
  },
  '/api/day-logs/{date}': {
    get: operation('getDayLog', {
      tag: 'Reports',
      summary: 'Nap, illness and notes for a day',
      params: [dateParam('date', 'path', 'Day')],
      ok: { schema: ref('DayLog') },
      errors: [400],
    }),
    patch: operation('updateDayLog', {
      tag: 'Reports',
      summary: 'Update nap, illness or notes',
      description: 'Fields you leave out are kept. `nap: null` means “not sure”.',
      params: [dateParam('date', 'path', 'Day')],
      body: v.dayLogPatch,
      ok: { schema: ref('DayLog') },
    }),
  },
  '/api/reports/daily': {
    get: operation('dailyReport', {
      tag: 'Reports',
      summary: 'Daily summary',
      params: [dateParam('date', 'query', 'Day (default: today in the parent’s time zone)')],
      ok: { schema: ref('DailyReport') },
      errors: [400],
    }),
  },
  '/api/reports/weekly': {
    get: operation('weeklyReport', {
      tag: 'Reports',
      summary: 'Weekly report vs. the previous week',
      params: [dateParam('end', 'query', 'Last day of the week (default: today)')],
      ok: { schema: ref('WeeklyReport') },
      errors: [400],
    }),
  },

  // --- The caregiver's app (caregiver session token) ----------------------------
  '/api/caregiver/me': {
    get: operation('caregiverMe', {
      tag: 'Caregiver app',
      summary: 'The signed-in caregiver, their family and unread messages',
      ok: { schema: ref('CaregiverMe') },
    }),
    patch: operation('caregiverUpdateMe', {
      tag: 'Caregiver app',
      summary: 'Change the language the caregiver sees TARA in',
      body: v.caregiverUpdateMe,
      ok: { schema: ref('CaregiverProfile') },
    }),
  },
  '/api/caregiver/day': {
    get: operation('caregiverDay', {
      tag: 'Caregiver app',
      summary: 'The caregiver’s activities for a day, in their language',
      description: 'Goals and how the day went are only included when the parent shares them with this caregiver.',
      params: [dateParam('date', 'query', 'Day (default: today in the family’s time zone)')],
      ok: { schema: ref('CaregiverDay') },
      errors: [400],
    }),
  },
  '/api/caregiver/assignments/{id}': {
    patch: operation('caregiverReport', {
      tag: 'Caregiver app',
      summary: 'Record how an activity went (or undo that)',
      description: 'Only the caregiver’s own activities, and only from their day onward (400 for a future day).',
      params: [idParam('Assignment')],
      body: v.caregiverReport,
      ok: { schema: ref('Assignment') },
      errors: [404],
    }),
  },
  '/api/caregiver/day-log': {
    patch: operation('caregiverDayLog', {
      tag: 'Caregiver app',
      summary: 'Log today’s nap, or that the child seems unwell',
      description: '`illness: true` also alerts the parent.',
      body: v.caregiverDayLog,
      ok: { schema: { type: 'object', properties: { nap: { type: ['boolean', 'null'] }, illness: { type: 'boolean' } }, required: ['nap', 'illness'] } },
    }),
  },
  '/api/caregiver/messages': {
    get: operation('caregiverMessages', {
      tag: 'Caregiver app',
      summary: 'Chat with the parent (latest 200, oldest first)',
      description: 'Marks the parent’s messages as read.',
      ok: { schema: list('Message') },
    }),
    post: operation('caregiverSendMessage', {
      tag: 'Caregiver app',
      summary: 'Message the parent',
      description: 'Also lands in the parent’s inbox. Medicine or pickup questions, development worries and goal ideas are flagged as such.',
      body: v.message,
      ok: { status: 201, schema: ref('Message'), description: 'Sent' },
    }),
  },
};

// ---------------------------------------------------------------------------

const errorResponse = (description: string, example: string) => ({
  description,
  content: { 'application/json': { schema: ref('Error'), example: { error: example } } },
});

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'TARA API',
    version,
    description: [
      'One activity plan shared with every caregiver, with the parent in charge. Parents set goals, build activities and assign them; caregivers sign in to the TARA app with their own login, see their activities in their own language and report how they went, which becomes daily and weekly reports.',
      '',
      '**Try it here:** `POST /api/auth/signup` (or `/api/auth/login`; after `npm run seed` the demo parent is `jordan@demo.cocare` / `demo1234`), copy the `token`, click **Authorize** and paste it.',
      '',
      '**Two kinds of session:** parent tokens (sign-up / login) work on every route except `/api/caregiver/*`; caregiver tokens (`/api/auth/caregiver/join` or `/login`; demo caregiver `rosa@demo.cocare` / `demo1234`) work only on `/api/caregiver/*`.',
      '',
      '**Conventions:** dates are `YYYY-MM-DD` in the parent’s time zone; timestamps are ISO 8601 (UTC). Errors are `{ "error": "…" }` with a message written for the parent. Times of day: ' +
        ROUTINE_ANCHORS.map((a) => `\`${a.id}\``).join(', ') +
        '.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: [
    { name: 'Auth', description: 'Parent and caregiver accounts and sessions' },
    { name: 'Family', description: 'Launch data and the parent’s inbox' },
    { name: 'Caregivers', description: 'Who looks after the child, and their invite codes' },
    { name: 'Goals', description: 'What the parent wants to work on' },
    { name: 'Activities', description: 'The parent’s activities and the reviewed library' },
    { name: 'Assignments', description: 'Which caregiver does what, when' },
    { name: 'Messages', description: 'In-app chat between the parent and a caregiver' },
    { name: 'Reports', description: 'Day logs, daily summary, weekly report' },
    { name: 'Caregiver app', description: 'What a signed-in caregiver sees and does (caregiver token)' },
    { name: 'System', description: 'Health and status' },
  ],
  security: [{ bearerAuth: [] }],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'The `token` from a parent or caregiver sign-in. Sessions last SESSION_DAYS (default 30).',
      },
    },
    schemas: componentSchemas,
    responses: {
      BadRequest: errorResponse('Invalid input', 'Password must be at least 8 characters.'),
      Unauthorized: errorResponse('Missing, invalid or expired session token', 'Please sign in again.'),
      Forbidden: errorResponse('The parent paused this caregiver’s access', 'Jordan has paused your access to TARA.'),
      NotFound: errorResponse('Not found, or it belongs to another family', 'Caregiver not found.'),
      Conflict: errorResponse('Already exists, or needs confirmation', 'Rosa already has 2 activities that day. Keep it to one or two per shift.'),
      TooManyRequests: errorResponse('Rate limit reached', 'Too many attempts. Please wait a few minutes and try again.'),
    },
  },
} as const;
