/** Goals, activities and assignments: what the parent plans. */
import { Router } from 'express';

import { toActivity, toAssignment, toGoal } from '../db/mappers.js';
import { exec, many, one, setClause } from '../db/pool.js';
import { requireParent } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { activityById, DEFAULT_SONG } from '../shared/library.js';
import { fill } from '../shared/messages.js';
import { caregiverDay, getActivity, getAssignment, getCaregiver, sendNudge, todayIn } from '../services/workflow.js';
import * as v from '../validation.js';

async function checkGoal(parentId: string, goalId: string | null | undefined) {
  if (goalId && !(await one('SELECT 1 FROM goals WHERE id = $1 AND parent_id = $2', [goalId, parentId]))) {
    throw new HttpError(404, 'Goal not found.');
  }
}

// --- Goals ---------------------------------------------------------------------

export const goalsRouter = Router();
goalsRouter.use(requireParent);

goalsRouter.post('/', async (req, res) => {
  const b = v.createGoal.parse(req.body);
  const row = await one('INSERT INTO goals (parent_id, title, area, notes) VALUES ($1, $2, $3, $4) RETURNING *', [
    req.parent.id,
    b.title,
    b.area,
    b.notes,
  ]);
  res.status(201).json(toGoal(row!));
});

goalsRouter.patch('/:id', async (req, res) => {
  const b = v.updateGoal.parse(req.body);
  const set = setClause({ title: b.title, area: b.area, notes: b.notes, active: b.active }, 3);
  const row = set.empty
    ? await one('SELECT * FROM goals WHERE id = $1 AND parent_id = $2', [req.params.id, req.parent.id])
    : await one(`UPDATE goals SET ${set.sql} WHERE id = $1 AND parent_id = $2 RETURNING *`, [
        req.params.id,
        req.parent.id,
        ...set.values,
      ]);
  if (!row) throw new HttpError(404, 'Goal not found.');
  res.json(toGoal(row));
});

goalsRouter.delete('/:id', async (req, res) => {
  await exec('DELETE FROM goals WHERE id = $1 AND parent_id = $2', [req.params.id, req.parent.id]);
  res.json({ ok: true });
});

// --- Activities ----------------------------------------------------------------

export const activitiesRouter = Router();
activitiesRouter.use(requireParent);

activitiesRouter.post('/', async (req, res) => {
  const b = v.createActivity.parse(req.body);
  await checkGoal(req.parent.id, b.goalId);
  const row = await one(
    `INSERT INTO activities (parent_id, goal_id, title, steps, minutes, safety_note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.parent.id, b.goalId, b.title, b.steps, b.minutes, b.safetyNote]
  );
  res.status(201).json(toActivity(row!));
});

/** Copy an activity from the reviewed library (it keeps its translations for caregivers). */
activitiesRouter.post('/from-library', async (req, res) => {
  const b = v.fromLibrary.parse(req.body);
  const lib = activityById(b.libraryId);
  if (!lib) throw new HttpError(404, 'Library activity not found.');
  await checkGoal(req.parent.id, b.goalId);
  if (await one('SELECT 1 FROM activities WHERE parent_id = $1 AND library_id = $2', [req.parent.id, lib.id])) {
    throw new HttpError(409, `“${lib.title.en}” is already in your activities.`);
  }
  const row = await one(
    `INSERT INTO activities (parent_id, goal_id, title, steps, minutes, safety_note, library_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      req.parent.id,
      b.goalId,
      lib.title.en,
      lib.steps.map((s) => fill(s.en, { song: DEFAULT_SONG.en })),
      lib.minutes,
      lib.safetyLabels[0]?.en ?? '',
      lib.id,
    ]
  );
  res.status(201).json(toActivity(row!));
});

activitiesRouter.patch('/:id', async (req, res) => {
  const current = await getActivity(req.parent.id, req.params.id);
  const b = v.updateActivity.parse(req.body);
  await checkGoal(req.parent.id, b.goalId);
  // Rewording a library activity means its translations no longer match: send it as written.
  const reworded =
    (b.title !== undefined && b.title !== current.title) ||
    (b.steps !== undefined && b.steps.join('\n') !== current.steps.join('\n'));
  const set = setClause(
    {
      title: b.title,
      steps: b.steps,
      goal_id: b.goalId,
      minutes: b.minutes,
      safety_note: b.safetyNote,
      library_id: reworded ? null : undefined,
    },
    3
  );
  if (!set.empty) {
    await exec(`UPDATE activities SET ${set.sql} WHERE id = $1 AND parent_id = $2`, [req.params.id, req.parent.id, ...set.values]);
  }
  res.json(await getActivity(req.parent.id, req.params.id));
});

activitiesRouter.delete('/:id', async (req, res) => {
  await exec('DELETE FROM activities WHERE id = $1 AND parent_id = $2', [req.params.id, req.parent.id]);
  res.json({ ok: true });
});

// --- Assignments ---------------------------------------------------------------

export const assignmentsRouter = Router();
assignmentsRouter.use(requireParent);

assignmentsRouter.get('/', async (req, res) => {
  const q = v.assignmentRange.parse(req.query);
  const from = q.from ?? todayIn(req.parent.timezone);
  const rows = await many(
    'SELECT * FROM assignments WHERE parent_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date, created_at',
    [req.parent.id, from, q.to ?? from]
  );
  res.json(rows.map(toAssignment));
});

assignmentsRouter.post('/', async (req, res) => {
  const b = v.createAssignment.parse(req.body);
  const caregiver = await getCaregiver(req.parent.id, b.caregiverId);
  await getActivity(req.parent.id, b.activityId);
  if (b.date < todayIn(req.parent.timezone)) throw new HttpError(400, 'Pick today or a later date.');
  // Guardrail from the workflow: "Too many → one or two per shift".
  const sameDay = (await caregiverDay(req.parent.id, caregiver.id, b.date)).length;
  if (sameDay >= 2 && !b.allowMore) {
    throw new HttpError(409, `${caregiver.name} already has ${sameDay} activities that day. Keep it to one or two per shift.`);
  }
  const row = await one(
    `INSERT INTO assignments (parent_id, caregiver_id, activity_id, date, anchor, note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.parent.id, caregiver.id, b.activityId, b.date, b.anchor, b.note]
  );
  // Caregivers see it in their app right away.
  res.status(201).json(toAssignment(row!));
});

assignmentsRouter.patch('/:id', async (req, res) => {
  const current = await getAssignment(req.parent.id, req.params.id);
  const b = v.updateAssignment.parse(req.body);
  if (b.caregiverId) await getCaregiver(req.parent.id, b.caregiverId);
  if (b.activityId) await getActivity(req.parent.id, b.activityId);
  const reported = b.status && ['done', 'skipped', 'changed'].includes(b.status) && b.status !== current.status;
  const set = setClause(
    {
      status: b.status,
      reaction: b.reaction,
      note: b.note,
      date: b.date,
      anchor: b.anchor,
      caregiver_id: b.caregiverId,
      activity_id: b.activityId,
      reported_at: reported ? new Date() : undefined,
    },
    3
  );
  if (!set.empty) {
    await exec(`UPDATE assignments SET ${set.sql} WHERE id = $1 AND parent_id = $2`, [req.params.id, req.parent.id, ...set.values]);
  }
  res.json(await getAssignment(req.parent.id, req.params.id));
});

assignmentsRouter.delete('/:id', async (req, res) => {
  await exec('DELETE FROM assignments WHERE id = $1 AND parent_id = $2', [req.params.id, req.parent.id]);
  res.json({ ok: true });
});

/** Posts a friendly "how did it go?" reminder in the caregiver's chat, in their language. */
assignmentsRouter.post('/:id/nudge', async (req, res) => {
  const a = await getAssignment(req.parent.id, req.params.id);
  if (!['planned', 'sent'].includes(a.status)) throw new HttpError(400, 'This activity already has a report.');
  res.status(201).json(await sendNudge(req.parent, a));
});
