/** The parent's caregivers: who they are, their invite codes, access, and the chat with each. */
import { Router } from 'express';

import { config } from '../config.js';
import { exec, one, setClause } from '../db/pool.js';
import { newInviteCode, requireParent } from '../middleware/auth.js';
import { toCaregiver } from '../db/mappers.js';
import { getCaregiver, postMessage, thread } from '../services/workflow.js';
import * as v from '../validation.js';

export const caregiversRouter = Router();
caregiversRouter.use(requireParent);

caregiversRouter.post('/', async (req, res) => {
  const b = v.createCaregiver.parse(req.body);
  const row = await one(
    `INSERT INTO caregivers (parent_id, name, relation, phone, language, days, sees_goals, sees_day_details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [req.parent.id, b.name, b.relation, b.phone, b.language, b.days, b.seesGoals, b.seesDayDetails]
  );
  res.status(201).json(toCaregiver(row!));
});

caregiversRouter.patch('/:id', async (req, res) => {
  const current = await getCaregiver(req.parent.id, req.params.id);
  const b = v.updateCaregiver.parse(req.body);
  let status: string | undefined;
  if (b.paused === true) status = 'stopped';
  if (b.paused === false && current.status === 'stopped') {
    const row = await one('SELECT password_hash FROM caregivers WHERE id = $1', [current.id]);
    status = row?.password_hash ? 'joined' : current.inviteCode ? 'invited' : 'not-invited';
  }
  const set = setClause(
    {
      name: b.name,
      relation: b.relation,
      phone: b.phone,
      language: b.language,
      days: b.days,
      status,
      sees_goals: b.seesGoals,
      sees_day_details: b.seesDayDetails,
    },
    3
  );
  if (!set.empty) {
    await exec(`UPDATE caregivers SET ${set.sql} WHERE id = $1 AND parent_id = $2`, [req.params.id, req.parent.id, ...set.values]);
  }
  // Pausing signs them out everywhere.
  if (status === 'stopped') await exec('DELETE FROM sessions WHERE caregiver_id = $1', [current.id]);
  res.json(await getCaregiver(req.parent.id, req.params.id));
});

caregiversRouter.delete('/:id', async (req, res) => {
  await exec('DELETE FROM caregivers WHERE id = $1 AND parent_id = $2', [req.params.id, req.parent.id]);
  res.json({ ok: true });
});

/**
 * Makes a new invite code (the old one stops working). The parent shares it, or a join link with
 * it, however they like. For a caregiver who already joined, the code lets them set a new login.
 */
caregiversRouter.post('/:id/invite', async (req, res) => {
  const c = await getCaregiver(req.parent.id, req.params.id);
  for (let attempt = 0; ; attempt++) {
    try {
      await exec(
        `UPDATE caregivers SET invite_code = $2, invite_expires_at = now() + make_interval(days => $3),
           status = CASE WHEN status = 'not-invited' THEN 'invited'::caregiver_status ELSE status END
         WHERE id = $1`,
        [c.id, newInviteCode(), config.INVITE_DAYS]
      );
      break;
    } catch (err) {
      // A code clash is astronomically unlikely, but just make another one.
      if ((err as { code?: string }).code !== '23505' || attempt >= 3) throw err;
    }
  }
  res.json(await getCaregiver(req.parent.id, c.id));
});

caregiversRouter.get('/:id/messages', async (req, res) => {
  const c = await getCaregiver(req.parent.id, req.params.id);
  res.json(await thread(req.parent.id, c.id, 'parent'));
});

caregiversRouter.post('/:id/messages', async (req, res) => {
  const { text } = v.message.parse(req.body);
  const c = await getCaregiver(req.parent.id, req.params.id);
  res.status(201).json(await postMessage({ parentId: req.parent.id, caregiverId: c.id, direction: 'out', kind: 'chat', body: text }));
});
