/** Bootstrap, alerts, day logs and reports: what the parent sees. */
import { Router } from 'express';

import { toActivity, toAlert, toCaregiver, toGoal } from '../db/mappers.js';
import { exec, many } from '../db/pool.js';
import { requireParent } from '../middleware/auth.js';
import { ACTIVITIES } from '../shared/library.js';
import { dailyReport, getDayLog, todayIn, upsertDayLog, weeklyReport } from '../services/workflow.js';
import * as v from '../validation.js';

export const publicRouter = Router();

publicRouter.get('/library', (_req, res) => {
  res.json(ACTIVITIES.map((a) => ({ id: a.id, title: a.title.en, area: a.area })));
});

export const familyRouter = Router();
familyRouter.use(requireParent);

/** Everything the app needs on launch, in one request. */
familyRouter.get('/bootstrap', async (req, res) => {
  const id = req.parent.id;
  const [caregivers, goals, activities, alerts] = await Promise.all([
    many('SELECT * FROM caregivers WHERE parent_id = $1 ORDER BY created_at', [id]),
    many('SELECT * FROM goals WHERE parent_id = $1 ORDER BY active DESC, created_at', [id]),
    many('SELECT * FROM activities WHERE parent_id = $1 ORDER BY created_at DESC', [id]),
    many('SELECT * FROM alerts WHERE parent_id = $1 AND NOT resolved ORDER BY created_at DESC', [id]),
  ]);
  res.json({
    parent: req.parent,
    today: todayIn(req.parent.timezone),
    caregivers: caregivers.map(toCaregiver),
    goals: goals.map(toGoal),
    activities: activities.map(toActivity),
    alerts: alerts.map(toAlert),
  });
});

familyRouter.patch('/alerts/:id', async (req, res) => {
  const { resolved } = v.resolveAlert.parse(req.body ?? {});
  await exec('UPDATE alerts SET resolved = $1 WHERE id = $2 AND parent_id = $3', [resolved, req.params.id, req.parent.id]);
  res.json({ ok: true });
});

familyRouter.get('/day-logs/:date', async (req, res) => {
  const date = v.isoDate('Date').parse(req.params.date);
  res.json(await getDayLog(req.parent.id, date));
});

familyRouter.patch('/day-logs/:date', async (req, res) => {
  const date = v.isoDate('Date').parse(req.params.date);
  const b = v.dayLogPatch.parse(req.body);
  res.json(
    await upsertDayLog(
      req.parent.id,
      date,
      Object.fromEntries(Object.entries(b).filter(([, value]) => value !== undefined))
    )
  );
});

familyRouter.get('/reports/daily', async (req, res) => {
  const { date } = v.dateQuery('date').parse(req.query);
  res.json(await dailyReport(req.parent, (date as string | undefined) ?? todayIn(req.parent.timezone)));
});

familyRouter.get('/reports/weekly', async (req, res) => {
  const { end } = v.dateQuery('end').parse(req.query);
  res.json(await weeklyReport(req.parent, (end as string | undefined) ?? todayIn(req.parent.timezone)));
});
