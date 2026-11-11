/**
 * Keeps the API docs honest: the OpenAPI document is valid, every documented operation is a real
 * route, and real responses match the documented response schemas.
 */
import SwaggerParser from '@apidevtools/swagger-parser';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/create-app.js';
import { openapi } from '../src/docs/openapi.js';
import { migrate } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';
import { todayIn } from '../src/services/workflow.js';

const app = createApp();
const spec = JSON.parse(JSON.stringify(openapi)) as {
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
};

// Validate response bodies against the documented schemas (refs resolve inside the document).
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats.default(ajv);
ajv.addSchema(spec, 'openapi.json');
const pointer = (...parts: string[]) => parts.map((p) => p.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');

function expectDocumented(method: string, path: string, res: request.Response) {
  const op = spec.paths[path]?.[method];
  assert.ok(op, `${method.toUpperCase()} ${path} is not documented`);
  const status = String(res.status);
  assert.ok(op.responses[status], `${method.toUpperCase()} ${path}: status ${status} is not documented (${res.text.slice(0, 200)})`);
  const resp = op.responses[status] as { $ref?: string; content?: Record<string, unknown> };
  if (resp.$ref || !resp.content?.['application/json']) return; // error responses / non-JSON
  const validate = ajv.getSchema(`openapi.json#/${pointer('paths', path, method, 'responses', status, 'content', 'application/json', 'schema')}`);
  assert.ok(validate, 'schema not found');
  assert.ok(
    validate(res.body),
    `${method.toUpperCase()} ${path} → ${status} doesn't match the docs:\n${ajv.errorsText(validate.errors, { separator: '\n' })}`
  );
}

let token = '';
const call = async (method: 'get' | 'post' | 'patch' | 'delete', docPath: string, path: string, body?: object) => {
  let req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
  if (body) req = req.send(body);
  const res = await req;
  expectDocumented(method, docPath, res);
  return res;
};

before(async () => {
  await migrate({ quiet: true });
});
after(async () => {
  await pool.end();
});

describe('OpenAPI document', () => {
  test('is a valid OpenAPI 3.1 document', async () => {
    await SwaggerParser.validate(JSON.parse(JSON.stringify(openapi)));
  });

  test('has no $id keywords (they would rebase $refs and break Swagger UI)', () => {
    const found: string[] = [];
    const walk = (node: unknown, at: string) => {
      if (!node || typeof node !== 'object') return;
      for (const [k, value] of Object.entries(node)) {
        if (k === '$id') found.push(at);
        walk(value, `${at}/${k}`);
      }
    };
    walk(spec, '#');
    assert.deepEqual(found, []);
  });

  test('every $ref points at something that exists', () => {
    const missing: string[] = [];
    const resolve = (ref: string) =>
      ref
        .slice(2)
        .split('/')
        .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      for (const [k, value] of Object.entries(node)) {
        if (k === '$ref' && typeof value === 'string' && resolve(value) === undefined) missing.push(value);
        walk(value);
      }
    };
    walk(spec);
    assert.deepEqual(missing, []);
  });

  test('is served at /openapi.json and Swagger UI at /docs', async () => {
    const json = await request(app).get('/openapi.json');
    assert.equal(json.status, 200);
    assert.equal(json.body.openapi, '3.1.0');
    const ui = await request(app).get('/docs/');
    assert.equal(ui.status, 200);
    assert.match(ui.text, /swagger-ui/);
  });

  test('every documented operation is a real route', async () => {
    const today = todayIn('UTC');
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const method of Object.keys(methods)) {
        const url = path.replace('{id}', randomUUID()).replace('{date}', today);
        const res = await (request(app) as unknown as Record<string, (u: string) => request.Test>)[method](url).send({});
        assert.ok(
          !(res.status === 404 && /^No route for/.test(res.body?.error ?? '')),
          `${method.toUpperCase()} ${path} is documented but not routed`
        );
      }
    }
  });
});

describe('responses match the docs', () => {
  test('a full flow', async () => {
    const email = `docs-${randomUUID()}@example.com`;
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Docs', email, password: 'password123', childName: 'Mia', childAgeMonths: 18, timezone: 'UTC', phone: '+14155550100' });
    expectDocumented('post', '/api/auth/signup', signup);
    token = signup.body.token;
    const today = todayIn('UTC');

    expectDocumented('post', '/api/auth/login', await request(app).post('/api/auth/login').send({ email, password: 'password123' }));
    expectDocumented('post', '/api/auth/login', await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' }));
    expectDocumented('get', '/api/bootstrap', await request(app).get('/api/bootstrap'));
    expectDocumented('get', '/api/library', await request(app).get('/api/library'));
    expectDocumented('get', '/health', await request(app).get('/health'));

    await call('get', '/api/me', '/api/me');
    await call('patch', '/api/me', '/api/me', { childAgeMonths: 19 });
    await call('patch', '/api/me', '/api/me', { childAgeMonths: 'abc' });

    const cg = await call('post', '/api/caregivers', '/api/caregivers', { name: 'Rosa', language: 'es', days: ['Mon'] });
    const caregiverId = cg.body.id;
    await call('patch', '/api/caregivers/{id}', `/api/caregivers/${caregiverId}`, { seesGoals: true, phone: '+1 415 555 0123' });
    await call('patch', '/api/caregivers/{id}', `/api/caregivers/${randomUUID()}`, { seesGoals: true });
    const invite = await call('post', '/api/caregivers/{id}/invite', `/api/caregivers/${caregiverId}/invite`);
    const code = invite.body.inviteCode as string;

    expectDocumented('get', '/api/auth/invite/{code}', await request(app).get(`/api/auth/invite/${code}`));
    expectDocumented('get', '/api/auth/invite/{code}', await request(app).get('/api/auth/invite/NOPE1234'));
    const caregiverEmail = `rosa-${randomUUID()}@example.com`;
    const join = await request(app).post('/api/auth/caregiver/join').send({ code, email: caregiverEmail, password: 'password123' });
    expectDocumented('post', '/api/auth/caregiver/join', join);
    expectDocumented('post', '/api/auth/caregiver/join', await request(app).post('/api/auth/caregiver/join').send({ code, email: 'a@b.co', password: 'password123' }));
    const caregiverLogin = await request(app).post('/api/auth/caregiver/login').send({ email: caregiverEmail, password: 'password123' });
    expectDocumented('post', '/api/auth/caregiver/login', caregiverLogin);
    expectDocumented('post', '/api/auth/caregiver/login', await request(app).post('/api/auth/caregiver/login').send({ email: caregiverEmail, password: 'wrong' }));
    const caregiverToken = caregiverLogin.body.token as string;
    const asCaregiver = async (method: 'get' | 'post' | 'patch', docPath: string, path: string, body?: object) => {
      let req = request(app)[method](path).set('Authorization', `Bearer ${caregiverToken}`);
      if (body) req = req.send(body);
      const res = await req;
      expectDocumented(method, docPath, res);
      return res;
    };

    const goal = await call('post', '/api/goals', '/api/goals', { title: 'Say more words', area: 'language' });
    await call('patch', '/api/goals/{id}', `/api/goals/${goal.body.id}`, { active: false });
    const lib = await call('post', '/api/activities/from-library', '/api/activities/from-library', { libraryId: 'block-tower', goalId: goal.body.id });
    await call('post', '/api/activities/from-library', '/api/activities/from-library', { libraryId: 'block-tower' });
    const own = await call('post', '/api/activities', '/api/activities', { title: 'Name the animals', steps: ['Open the book'] });
    await call('patch', '/api/activities/{id}', `/api/activities/${own.body.id}`, { minutes: 15 });

    const a1 = await call('post', '/api/assignments', '/api/assignments', { caregiverId, activityId: lib.body.id, date: today, anchor: 'after-breakfast', note: 'hi' });
    await call('post', '/api/assignments', '/api/assignments', { caregiverId, activityId: own.body.id, date: today, anchor: 'before-nap' });
    await call('post', '/api/assignments', '/api/assignments', { caregiverId, activityId: own.body.id, date: today, anchor: 'bath-time' });
    await call('get', '/api/assignments', `/api/assignments?from=${today}&to=${today}`);
    await call('post', '/api/assignments/{id}/nudge', `/api/assignments/${a1.body.id}/nudge`);
    await call('patch', '/api/assignments/{id}', `/api/assignments/${a1.body.id}`, { status: 'done', reaction: 'loved' });
    await call('post', '/api/assignments/{id}/nudge', `/api/assignments/${a1.body.id}/nudge`);
    await call('post', '/api/caregivers/{id}/messages', `/api/caregivers/${caregiverId}/messages`, { text: 'Gracias!' });
    await call('get', '/api/caregivers/{id}/messages', `/api/caregivers/${caregiverId}/messages`);

    await asCaregiver('get', '/api/caregiver/me', '/api/caregiver/me');
    await asCaregiver('patch', '/api/caregiver/me', '/api/caregiver/me', { language: 'zh' });
    const day = await asCaregiver('get', '/api/caregiver/day', `/api/caregiver/day?date=${today}`);
    await asCaregiver('get', '/api/caregiver/day', '/api/caregiver/day?date=soon');
    await asCaregiver('patch', '/api/caregiver/assignments/{id}', `/api/caregiver/assignments/${day.body.items[1].assignment.id}`, { status: 'skipped', note: '' });
    await asCaregiver('patch', '/api/caregiver/assignments/{id}', `/api/caregiver/assignments/${randomUUID()}`, { status: 'done' });
    await asCaregiver('patch', '/api/caregiver/day-log', '/api/caregiver/day-log', { nap: true });
    await asCaregiver('post', '/api/caregiver/messages', '/api/caregiver/messages', { text: '¿Le puedo dar Tylenol?' });
    await asCaregiver('get', '/api/caregiver/messages', '/api/caregiver/messages');

    await call('patch', '/api/caregivers/{id}', `/api/caregivers/${caregiverId}`, { paused: true });
    expectDocumented('post', '/api/auth/caregiver/login', await request(app).post('/api/auth/caregiver/login').send({ email: caregiverEmail, password: 'password123' }));
    await asCaregiver('get', '/api/caregiver/me', '/api/caregiver/me'); // 401 once paused

    const boot = await call('get', '/api/bootstrap', '/api/bootstrap');
    assert.ok(boot.body.alerts.length > 0);
    await call('patch', '/api/alerts/{id}', `/api/alerts/${boot.body.alerts[0].id}`, { resolved: true });
    await call('patch', '/api/day-logs/{date}', `/api/day-logs/${today}`, { nap: true });
    await call('get', '/api/day-logs/{date}', `/api/day-logs/${today}`);
    await call('get', '/api/reports/daily', `/api/reports/daily?date=${today}`);
    await call('get', '/api/reports/daily', '/api/reports/daily?date=yesterday');
    await call('get', '/api/reports/weekly', `/api/reports/weekly?end=${today}`);

    await call('delete', '/api/assignments/{id}', `/api/assignments/${a1.body.id}`);
    await call('delete', '/api/activities/{id}', `/api/activities/${own.body.id}`);
    await call('delete', '/api/goals/{id}', `/api/goals/${goal.body.id}`);
    await call('delete', '/api/caregivers/{id}', `/api/caregivers/${caregiverId}`);
    await call('post', '/api/auth/logout', '/api/auth/logout');
    await call('get', '/api/me', '/api/me'); // 401 after logout
  });
});
