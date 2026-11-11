import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import { config } from '../config.js';
import { toCaregiverProfile, toParent } from '../db/mappers.js';
import { one, setClause, transaction } from '../db/pool.js';
import {
  bearerToken,
  createSession,
  deleteSession,
  hashPassword,
  normalizeInviteCode,
  requireParent,
  verifyPassword,
} from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import * as v from '../validation.js';

export const authRouter = Router();

/** Slows down password and invite-code guessing: 20 attempts per 15 minutes per IP. */
const limiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => config.NODE_ENV === 'test',
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

// --- Parents ---------------------------------------------------------------------

authRouter.post('/signup', limiter, async (req, res) => {
  const body = v.signUp.parse(req.body);
  if (await one('SELECT 1 FROM parents WHERE lower(email) = $1', [body.email])) {
    throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
  }
  const row = await one(
    `INSERT INTO parents (name, email, password_hash, phone, child_name, child_age_months, timezone)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      body.name,
      body.email,
      await hashPassword(body.password),
      body.phone ?? null,
      body.childName,
      body.childAgeMonths,
      body.timezone ?? 'UTC',
    ]
  );
  res.status(201).json({ token: await createSession(row!.id), parent: toParent(row!) });
});

authRouter.post('/login', limiter, async (req, res) => {
  const { email, password } = v.signIn.parse(req.body);
  const row = await one('SELECT * FROM parents WHERE lower(email) = $1', [email]);
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw new HttpError(401, 'Email or password is incorrect.');
  }
  res.json({ token: await createSession(row.id), parent: toParent(row) });
});

// --- Caregivers ------------------------------------------------------------------

async function findInvite(code: string) {
  const normalized = normalizeInviteCode(code);
  const row = normalized
    ? await one(
        `SELECT c.*, p.name AS parent_name, p.child_name FROM caregivers c JOIN parents p ON p.id = c.parent_id
         WHERE c.invite_code = $1 AND c.invite_expires_at > now()`,
        [normalized]
      )
    : undefined;
  if (!row) throw new HttpError(404, 'That invite code doesn’t work. Check it, or ask for a new one.');
  if (row.status === 'stopped') throw new HttpError(403, `${row.parent_name} has paused your access to TARA.`);
  return row;
}

/** Who sent this invite, so the join screen can say "Jordan invited you to help with Mia". */
authRouter.get('/invite/:code', limiter, async (req, res) => {
  const row = await findInvite(String(req.params.code));
  res.json({ caregiverName: row.name, parentName: row.parent_name, childName: row.child_name });
});

/**
 * A caregiver creates their login with the parent's invite code. Using a new code on an existing
 * login replaces its email and password (that's how a caregiver resets a forgotten password).
 */
authRouter.post('/caregiver/join', limiter, async (req, res) => {
  const body = v.caregiverJoin.parse(req.body);
  const invite = await findInvite(body.code);
  if (await one('SELECT 1 FROM caregivers WHERE lower(email) = $1 AND id <> $2', [body.email, invite.id])) {
    throw new HttpError(409, 'A caregiver login with this email already exists. Use another email, or sign in.');
  }
  const passwordHash = await hashPassword(body.password);
  const row = await transaction(async (db) => {
    await db.query('DELETE FROM sessions WHERE caregiver_id = $1', [invite.id]);
    return (
      await db.query(
        `UPDATE caregivers SET email = $2, password_hash = $3, status = 'joined', invite_code = NULL, invite_expires_at = NULL
         WHERE id = $1 RETURNING *`,
        [invite.id, body.email, passwordHash]
      )
    ).rows[0];
  });
  res.status(201).json({ token: await createSession(row.parent_id, row.id), caregiver: toCaregiverProfile(row) });
});

authRouter.post('/caregiver/login', limiter, async (req, res) => {
  const { email, password } = v.signIn.parse(req.body);
  const row = await one(
    `SELECT c.*, p.name AS parent_name FROM caregivers c JOIN parents p ON p.id = c.parent_id WHERE lower(c.email) = $1`,
    [email]
  );
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw new HttpError(401, 'Email or password is incorrect.');
  }
  if (row.status === 'stopped') throw new HttpError(403, `${row.parent_name} has paused your access to TARA.`);
  res.json({ token: await createSession(row.parent_id, row.id), caregiver: toCaregiverProfile(row) });
});

// --- Both ------------------------------------------------------------------------

authRouter.post('/logout', async (req, res) => {
  const token = bearerToken(req.headers.authorization);
  if (token) await deleteSession(token);
  res.json({ ok: true });
});

export const meRouter = Router();
meRouter.use(requireParent);

meRouter.get('/', (req, res) => {
  res.json(req.parent);
});

meRouter.patch('/', async (req, res) => {
  const body = v.updateMe.parse(req.body);
  const set = setClause(
    {
      name: body.name,
      phone: body.phone,
      child_name: body.childName,
      child_age_months: body.childAgeMonths,
      timezone: body.timezone,
    },
    2
  );
  const row = set.empty
    ? await one('SELECT * FROM parents WHERE id = $1', [req.parent.id])
    : await one(`UPDATE parents SET ${set.sql} WHERE id = $1 RETURNING *`, [req.parent.id, ...set.values]);
  res.json(toParent(row!));
});
