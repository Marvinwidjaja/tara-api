/**
 * Accounts for parents and caregivers: scrypt password hashes and bearer-token sessions (only
 * token hashes are stored). A session belongs to a caregiver when `caregiver_id` is set,
 * otherwise to the parent.
 */
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { RequestHandler } from 'express';

import { config } from '../config.js';
import { exec, one } from '../db/pool.js';
import { toCaregiver, toParent } from '../db/mappers.js';
import type { Caregiver, Parent } from '../shared/types.js';
import { HttpError } from './errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** The signed-in parent (`requireParent`), or the family of the signed-in caregiver (`requireCaregiver`). */
    parent: Parent;
    /** The signed-in caregiver (set by `requireCaregiver`). */
    caregiver: Caregiver;
  }
}

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scryptAsync(password, salt, 64)).toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  const [salt, hash] = (stored ?? '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await scryptAsync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(parentId: string, caregiverId: string | null = null) {
  const token = randomBytes(32).toString('base64url');
  await exec(
    `INSERT INTO sessions (token_hash, parent_id, caregiver_id, expires_at) VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
    [hashToken(token), parentId, caregiverId, config.SESSION_DAYS]
  );
  return token;
}

export async function deleteSession(token: string) {
  await exec('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

export const bearerToken = (header: string | undefined) => (header?.startsWith('Bearer ') ? header.slice(7).trim() : '');

/** Rejects the request with 401 unless it carries a valid, unexpired parent session token. */
export const requireParent: RequestHandler = async (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  const row = token
    ? await one(
        `SELECT p.* FROM sessions s JOIN parents p ON p.id = s.parent_id
         WHERE s.token_hash = $1 AND s.expires_at > now() AND s.caregiver_id IS NULL`,
        [hashToken(token)]
      )
    : undefined;
  if (!row) throw new HttpError(401, 'Please sign in again.');
  req.parent = toParent(row);
  next();
};

/** Rejects the request with 401 unless it carries a valid caregiver session whose access isn't paused. */
export const requireCaregiver: RequestHandler = async (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  const row = token
    ? await one(
        `SELECT c.* FROM sessions s JOIN caregivers c ON c.id = s.caregiver_id
         WHERE s.token_hash = $1 AND s.expires_at > now() AND c.status = 'joined'`,
        [hashToken(token)]
      )
    : undefined;
  if (!row) throw new HttpError(401, 'Please sign in again.');
  req.caregiver = toCaregiver(row);
  req.parent = toParent((await one('SELECT * FROM parents WHERE id = $1', [row.parent_id]))!);
  next();
};

/** Invite codes skip look-alike characters (0/O, 1/I/L) so they're easy to read out loud. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const newInviteCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

/** "abcd-2345 " → "ABCD2345". */
export const normalizeInviteCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
