/**
 * End-to-end API tests against a real PostgreSQL database (DATABASE_URL in .env.test).
 * Run with `npm test`. The test database is wiped before the run.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/create-app.js';
import { migrate } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';
import { todayIn } from '../src/services/workflow.js';

const app = createApp();
const TZ = 'America/New_York';
const today = todayIn(TZ);

let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });
const api = {
  get: (path: string) => request(app).get(path).set(auth()),
  post: (path: string, body: object = {}) => request(app).post(path).set(auth()).send(body),
  patch: (path: string, body: object) => request(app).patch(path).set(auth()).send(body),
  delete: (path: string) => request(app).delete(path).set(auth()),
};
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

before(async () => {
  if (!/test/.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing to wipe a database whose name lacks "test".');
  await migrate({ quiet: true });
  await pool.query('TRUNCATE parents CASCADE');
});

after(async () => {
  await pool.end();
});

describe('accounts', () => {
  test('sign up returns a token and the parent', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Jordan',
      email: 'Jordan@Example.com',
      password: 'password123',
      phone: '+1 (415) 555-0100',
      childName: 'Mia',
      childAgeMonths: 18,
      timezone: TZ,
    });
    assert.equal(res.status, 201, res.text);
    assert.ok(res.body.token);
    assert.equal(res.body.parent.email, 'jordan@example.com');
    assert.equal(res.body.parent.phone, '+14155550100');
    token = res.body.token;
  });

  test('duplicate email (any case) is rejected', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'J', email: 'JORDAN@example.com', password: 'password123', childName: 'Mia', childAgeMonths: 18 });
    assert.equal(res.status, 409);
  });

  test('validation errors are readable', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'J', email: 'x@y.co', password: 'short', childName: 'Mia', childAgeMonths: 18 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Password must be at least 8 characters.');
  });

  test('wrong password → 401, right password → token', async () => {
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'jordan@example.com', password: 'nope' })).status, 401);
    const res = await request(app).post('/api/auth/login').send({ email: 'jordan@example.com', password: 'password123' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  test('requests without a token get 401', async () => {
    const res = await request(app).get('/api/bootstrap');
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Please sign in again.');
  });
});

describe('the full workflow', () => {
  let rosa = '';
  let rosaToken = '';
  let goal = '';
  let blocks = '';
  let animals = '';
  const asRosa = () => ({ Authorization: `Bearer ${rosaToken}` });
  const cg = {
    get: (path: string) => request(app).get(path).set(asRosa()),
    post: (path: string, body: object = {}) => request(app).post(path).set(asRosa()).send(body),
    patch: (path: string, body: object) => request(app).patch(path).set(asRosa()).send(body),
  };

  test('add a caregiver (no phone needed), a goal and activities', async () => {
    const c = await api.post('/api/caregivers', {
      name: 'Rosa',
      relation: 'Nanny',
      language: 'es',
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      seesGoals: true,
    });
    assert.equal(c.status, 201, c.text);
    assert.equal(c.body.phone, null);
    assert.equal(c.body.status, 'not-invited');
    assert.equal(c.body.inviteCode, null);
    rosa = c.body.id;

    const g = await api.post('/api/goals', { title: 'Say more words', area: 'language' });
    assert.equal(g.status, 201);
    goal = g.body.id;

    const lib = await api.post('/api/activities/from-library', { libraryId: 'block-tower', goalId: goal });
    assert.equal(lib.status, 201);
    assert.equal(lib.body.libraryId, 'block-tower');
    blocks = lib.body.id;
    assert.equal((await api.post('/api/activities/from-library', { libraryId: 'block-tower' })).status, 409);

    const own = await api.post('/api/activities', {
      title: 'Name the animals',
      steps: ['Open the farm book', '', 'Point and say each animal'],
      goalId: goal,
    });
    assert.equal(own.status, 201);
    assert.deepEqual(own.body.steps, ['Open the farm book', 'Point and say each animal']);
    animals = own.body.id;
  });

  test('invite code: a new one replaces the old, preview shows who it is from', async () => {
    const first = await api.post(`/api/caregivers/${rosa}/invite`);
    assert.equal(first.status, 200, first.text);
    assert.equal(first.body.status, 'invited');
    assert.match(first.body.inviteCode, /^[A-Z2-9]{8}$/);
    const second = await api.post(`/api/caregivers/${rosa}/invite`);
    assert.notEqual(second.body.inviteCode, first.body.inviteCode);
    assert.equal((await request(app).get(`/api/auth/invite/${first.body.inviteCode}`)).status, 404, 'old code no longer works');

    const code = second.body.inviteCode as string;
    const pretty = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`;
    const preview = await request(app).get(`/api/auth/invite/${pretty}`);
    assert.equal(preview.status, 200, preview.text);
    assert.deepEqual(preview.body, { caregiverName: 'Rosa', parentName: 'Jordan', childName: 'Mia' });
  });

  test('caregiver joins with the code, then signs in with email and password', async () => {
    const code = (await api.get('/api/bootstrap')).body.caregivers[0].inviteCode;
    const join = await request(app)
      .post('/api/auth/caregiver/join')
      .send({ code: ` ${code.toLowerCase()} `, email: 'Rosa@Example.com', password: 'rosapass1' });
    assert.equal(join.status, 201, join.text);
    assert.equal(join.body.caregiver.email, 'rosa@example.com');
    rosaToken = join.body.token;

    const again = await request(app).post('/api/auth/caregiver/join').send({ code, email: 'x@y.co', password: 'rosapass1' });
    assert.equal(again.status, 404, 'a code works once');

    const boot = await api.get('/api/bootstrap');
    assert.equal(boot.body.caregivers[0].status, 'joined');
    assert.equal(boot.body.caregivers[0].inviteCode, null);
    assert.equal(boot.body.today, today);

    assert.equal(
      (await request(app).post('/api/auth/caregiver/login').send({ email: 'rosa@example.com', password: 'nope' })).status,
      401
    );
    const login = await request(app).post('/api/auth/caregiver/login').send({ email: 'rosa@example.com', password: 'rosapass1' });
    assert.equal(login.status, 200);
    assert.equal(login.body.caregiver.name, 'Rosa');
    assert.equal(
      (await request(app).post('/api/auth/login').send({ email: 'rosa@example.com', password: 'rosapass1' })).status,
      401,
      'caregiver logins are not parent logins'
    );
  });

  test('parent and caregiver sessions only open their own routes', async () => {
    assert.equal((await cg.get('/api/bootstrap')).status, 401);
    assert.equal((await api.get('/api/caregiver/me')).status, 401);
    const me = await cg.get('/api/caregiver/me');
    assert.equal(me.status, 200, me.text);
    assert.equal(me.body.caregiver.name, 'Rosa');
    assert.deepEqual(me.body.family, { parentName: 'Jordan', parentPhone: '+14155550100', childName: 'Mia', childAgeMonths: 18 });
  });

  test('assignments show up in the caregiver’s day, in Spanish', async () => {
    const a1 = await api.post('/api/assignments', { caregiverId: rosa, activityId: blocks, date: today, anchor: 'after-breakfast' });
    assert.equal(a1.status, 201, a1.text);
    assert.equal(a1.body.status, 'planned');
    const a2 = await api.post('/api/assignments', {
      caregiverId: rosa,
      activityId: animals,
      date: today,
      anchor: 'before-nap',
      note: 'Use the new farm book',
    });
    assert.equal(a2.status, 201);

    const day = await cg.get(`/api/caregiver/day?date=${today}`);
    assert.equal(day.status, 200, day.text);
    assert.deepEqual(
      day.body.items.map((i: { title: string }) => i.title),
      ['Torre de bloques', 'Name the animals']
    );
    assert.equal(day.body.items[1].assignment.note, 'Use the new farm book');
    assert.deepEqual(day.body.goals, ['hablar']);
    assert.equal(day.body.handoff, null, 'Rosa may not see how the day went');
    assert.ok(day.body.marked.includes(today));
  });

  test('"one or two per shift" guardrail asks before a third', async () => {
    const body = { caregiverId: rosa, activityId: blocks, date: today, anchor: 'bath-time' };
    assert.equal((await api.post('/api/assignments', body)).status, 409);
    const forced = await api.post('/api/assignments', { ...body, allowMore: true });
    assert.equal(forced.status, 201);
    assert.equal((await api.delete(`/api/assignments/${forced.body.id}`)).status, 200);
  });

  test('the caregiver reports activities, logs a nap, and can undo', async () => {
    const day = (await cg.get('/api/caregiver/day')).body;
    const [first, second] = day.items.map((i: { assignment: { id: string } }) => i.assignment.id);

    const done = await cg.patch(`/api/caregiver/assignments/${second}`, { status: 'done', reaction: 'loved', note: 'le encantó' });
    assert.equal(done.status, 200, done.text);
    assert.equal(done.body.status, 'done');
    assert.ok(done.body.reportedAt);

    assert.equal((await cg.patch(`/api/caregiver/assignments/${first}`, { status: 'done' })).body.status, 'done');
    const undo = await cg.patch(`/api/caregiver/assignments/${first}`, { status: 'planned' });
    assert.equal(undo.body.reportedAt, null);
    assert.equal((await cg.patch(`/api/caregiver/assignments/${first}`, { status: 'skipped' })).body.status, 'skipped');

    const log = await cg.patch('/api/caregiver/day-log', { nap: true });
    assert.deepEqual(log.body, { nap: true, illness: false });

    const list = await api.get(`/api/assignments?from=${today}`);
    const byActivity = Object.fromEntries(list.body.map((a: { activityId: string }) => [a.activityId, a]));
    assert.equal(byActivity[animals].status, 'done');
    assert.equal(byActivity[animals].reaction, 'loved');
    assert.equal(byActivity[animals].caregiverNote, 'le encantó');
    assert.equal(byActivity[blocks].status, 'skipped');
  });

  test('a caregiver can’t report tomorrow, or touch another caregiver’s activity', async () => {
    const later = await api.post('/api/assignments', {
      caregiverId: rosa,
      activityId: blocks,
      date: addDays(today, 1),
      anchor: 'after-breakfast',
    });
    assert.equal((await cg.patch(`/api/caregiver/assignments/${later.body.id}`, { status: 'done' })).status, 400);

    const li = await api.post('/api/caregivers', { name: 'Li' });
    const theirs = await api.post('/api/assignments', { caregiverId: li.body.id, activityId: animals, date: today, anchor: 'after-nap' });
    assert.equal((await cg.patch(`/api/caregiver/assignments/${theirs.body.id}`, { status: 'done' })).status, 404);
    await api.delete(`/api/caregivers/${li.body.id}`);
  });

  test('chat: messages go both ways, questions and worries reach the parent’s inbox', async () => {
    const sent = await api.post(`/api/caregivers/${rosa}/messages`, { text: 'Gracias, Rosa!' });
    assert.equal(sent.status, 201, sent.text);
    assert.equal(sent.body.status, 'sent');
    assert.equal((await cg.get('/api/caregiver/me')).body.unread, 1);

    const thread = await cg.get('/api/caregiver/messages');
    assert.equal(thread.body.at(-1).body, 'Gracias, Rosa!');
    assert.equal((await cg.get('/api/caregiver/me')).body.unread, 0, 'opening the chat marks it read');

    assert.equal((await cg.post('/api/caregiver/messages', { text: '¿Le puedo dar Tylenol?' })).status, 201);
    await cg.post('/api/caregiver/messages', { text: "I'm worried she's not talking" });
    const parentThread = await api.get(`/api/caregivers/${rosa}/messages`);
    assert.equal(parentThread.body.length, 3);
    assert.equal(parentThread.body[0].status, 'read');

    const boot = await api.get('/api/bootstrap');
    const kinds = boot.body.alerts.map((a: { kind: string }) => a.kind).sort();
    assert.deepEqual(kinds, ['development-worry', 'parent-question']);
  });

  test('reminders are posted in the caregiver’s chat, in their language', async () => {
    const later = (await api.get(`/api/assignments?from=${addDays(today, 1)}`)).body[0];
    const nudge = await api.post(`/api/assignments/${later.id}/nudge`);
    assert.equal(nudge.status, 201, nudge.text);
    assert.match(nudge.body.body, /Torre de bloques/);
    assert.match(nudge.body.english, /Block tower/);
    const done = (await api.get(`/api/assignments?from=${today}`)).body.find((a: { status: string }) => a.status === 'done');
    assert.equal((await api.post(`/api/assignments/${done.id}/nudge`)).status, 400);
  });

  test('daily and weekly reports', async () => {
    const daily = await api.get(`/api/reports/daily?date=${today}`);
    assert.equal(daily.status, 200);
    assert.equal(daily.body.planned, 2);
    assert.equal(daily.body.done, 1);
    assert.equal(daily.body.skipped, 1);
    assert.equal(daily.body.dayLog.nap, true);
    assert.match(daily.body.summary, /1 of 2 activities done\. Mia loved Name the animals\./);

    const weekly = await api.get(`/api/reports/weekly?end=${today}`);
    assert.equal(weekly.body.planned, 2);
    assert.equal(weekly.body.completionRate, 0.5);
    assert.deepEqual(weekly.body.loved, ['Name the animals']);
    assert.equal(weekly.body.byGoal[0].title, 'Say more words');
  });

  test('day logs and alerts can be updated', async () => {
    const log = await api.patch(`/api/day-logs/${today}`, { notes: 'Runny nose' });
    assert.equal(log.body.nap, true, 'unchanged fields are kept');
    const sick = await cg.patch('/api/caregiver/day-log', { illness: true });
    assert.equal(sick.body.illness, true);
    const boot = await api.get('/api/bootstrap');
    assert.ok(boot.body.alerts.some((a: { kind: string }) => a.kind === 'illness'), 'unwell alerts the parent');
    await api.patch(`/api/alerts/${boot.body.alerts[0].id}`, { resolved: true });
    assert.equal((await api.get('/api/bootstrap')).body.alerts.length, boot.body.alerts.length - 1);
  });

  test('pausing a caregiver signs them out; resuming lets them sign in again', async () => {
    const paused = await api.patch(`/api/caregivers/${rosa}`, { paused: true });
    assert.equal(paused.body.status, 'stopped');
    assert.equal((await cg.get('/api/caregiver/me')).status, 401);
    const blocked = await request(app).post('/api/auth/caregiver/login').send({ email: 'rosa@example.com', password: 'rosapass1' });
    assert.equal(blocked.status, 403);
    assert.match(blocked.body.error, /Jordan has paused/);

    assert.equal((await api.patch(`/api/caregivers/${rosa}`, { paused: false })).body.status, 'joined');
    const login = await request(app).post('/api/auth/caregiver/login').send({ email: 'rosa@example.com', password: 'rosapass1' });
    assert.equal(login.status, 200);
    rosaToken = login.body.token;
  });

  test('a new invite code resets a forgotten password', async () => {
    const code = (await api.post(`/api/caregivers/${rosa}/invite`)).body.inviteCode;
    assert.equal((await api.get('/api/bootstrap')).body.caregivers[0].status, 'joined', 'still joined meanwhile');
    const join = await request(app).post('/api/auth/caregiver/join').send({ code, email: 'rosa@example.com', password: 'newpass12' });
    assert.equal(join.status, 201, join.text);
    assert.equal((await cg.get('/api/caregiver/me')).status, 401, 'old sessions end');
    rosaToken = join.body.token;
    assert.equal((await cg.get('/api/caregiver/me')).status, 200);
  });

  test('caregiver can change their language', async () => {
    const res = await cg.patch('/api/caregiver/me', { language: 'en' });
    assert.equal(res.body.language, 'en');
    const day = await cg.get(`/api/caregiver/day?date=${today}`);
    assert.equal(day.body.items[0].title, 'Block tower');
  });

  test('editing a library activity drops its translations', async () => {
    const res = await api.patch(`/api/activities/${blocks}`, { title: 'Big block tower' });
    assert.equal(res.body.libraryId, null);
  });
});

describe('isolation and errors', () => {
  test("another parent can't see or change this family's data", async () => {
    const other = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Sam', email: 'sam@example.com', password: 'password123', childName: 'Leo', childAgeMonths: 26 });
    const mine = await api.get('/api/bootstrap');
    const caregiverId = mine.body.caregivers[0].id;
    const asSam = { Authorization: `Bearer ${other.body.token}` };

    const boot = await request(app).get('/api/bootstrap').set(asSam);
    assert.equal(boot.body.caregivers.length, 0);
    assert.equal((await request(app).get(`/api/caregivers/${caregiverId}/messages`).set(asSam)).status, 404);
    assert.equal((await request(app).patch(`/api/caregivers/${caregiverId}`).set(asSam).send({ name: 'X' })).status, 404);
  });

  test('bad ids and unknown routes are 404s, malformed JSON is a 400', async () => {
    assert.equal((await api.get('/api/caregivers/not-a-uuid/messages')).status, 404);
    assert.equal((await api.get('/api/nope')).status, 404);
    const res = await request(app).post('/api/goals').set(auth()).set('Content-Type', 'application/json').send('{bad');
    assert.equal(res.status, 400);
  });

  test('the cron sweep only runs with the right secret', async () => {
    assert.equal((await request(app).get('/api/cron/sweep')).status, 401);
    assert.equal((await request(app).get('/api/cron/sweep').set('Authorization', 'Bearer wrong')).status, 401);
    const ok = await request(app).get('/api/cron/sweep').set('Authorization', 'Bearer test-cron-secret-123');
    assert.equal(ok.status, 200, ok.text);
  });

  test('sign out ends the session', async () => {
    assert.equal((await api.post('/api/auth/logout')).status, 200);
    assert.equal((await api.get('/api/me')).status, 401);
  });
});
