/** What a signed-in caregiver can do: see their activities, report how they went, and message the parent. */
import { Router } from 'express';

import { toCaregiverProfile } from '../db/mappers.js';
import { one } from '../db/pool.js';
import { requireCaregiver } from '../middleware/auth.js';
import {
  caregiverDayLog,
  caregiverDayView,
  caregiverMe,
  caregiverMessage,
  caregiverReport,
  thread,
  todayIn,
} from '../services/workflow.js';
import * as v from '../validation.js';

export const caregiverAppRouter = Router();
caregiverAppRouter.use(requireCaregiver);

caregiverAppRouter.get('/me', async (req, res) => {
  res.json(await caregiverMe(req.parent, req.caregiver));
});

caregiverAppRouter.patch('/me', async (req, res) => {
  const { language } = v.caregiverUpdateMe.parse(req.body);
  const row = language
    ? await one('UPDATE caregivers SET language = $2 WHERE id = $1 RETURNING *', [req.caregiver.id, language])
    : await one('SELECT * FROM caregivers WHERE id = $1', [req.caregiver.id]);
  res.json(toCaregiverProfile(row!));
});

caregiverAppRouter.get('/day', async (req, res) => {
  const { date } = v.dateQuery('date').parse(req.query);
  res.json(await caregiverDayView(req.parent, req.caregiver, (date as string | undefined) ?? todayIn(req.parent.timezone)));
});

caregiverAppRouter.patch('/assignments/:id', async (req, res) => {
  const patch = v.caregiverReport.parse(req.body);
  res.json(await caregiverReport(req.parent, req.caregiver, req.params.id, patch));
});

caregiverAppRouter.patch('/day-log', async (req, res) => {
  const patch = v.caregiverDayLog.parse(req.body);
  res.json(await caregiverDayLog(req.parent, req.caregiver, patch));
});

caregiverAppRouter.get('/messages', async (req, res) => {
  res.json(await thread(req.parent.id, req.caregiver.id, 'caregiver'));
});

caregiverAppRouter.post('/messages', async (req, res) => {
  const { text } = v.message.parse(req.body);
  res.status(201).json(await caregiverMessage(req.parent, req.caregiver, text));
});
