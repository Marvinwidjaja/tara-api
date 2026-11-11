/**
 * The TARA workflow: what caregivers see in the app, their reports and messages, reminders for
 * missing reports, and daily / weekly reports for the parent.
 */
import { toActivity, toAlert, toAssignment, toCaregiver, toCaregiverProfile, toDayLog, toGoal, toMessage, toParent } from '../db/mappers.js';
import { exec, many, one } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';
import { classify } from '../shared/classify.js';
import { anchorById, GOAL_NAMES } from '../shared/library.js';
import { localizedActivity, render } from '../shared/messages.js';
import { addDays, buildDailyReport, buildWeeklyReport, byRoutine, prettyDate } from '../shared/reports.js';
import type {
  Activity,
  Alert,
  Assignment,
  Caregiver,
  CaregiverDay,
  CaregiverMe,
  DayLog,
  Message,
  MessageDirection,
  MessageKind,
  Parent,
} from '../shared/types.js';

/** Today's date (YYYY-MM-DD) in the parent's own time zone. */
export function todayIn(timezone: string, at = new Date()) {
  try {
    return at.toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** Monday of the week containing `date`. */
function startOfWeek(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, day === 0 ? -6 : 1 - day);
}

export async function getCaregiver(parentId: string, id: string) {
  const r = await one('SELECT * FROM caregivers WHERE id = $1 AND parent_id = $2', [id, parentId]);
  if (!r) throw new HttpError(404, 'Caregiver not found.');
  return toCaregiver(r);
}

export async function getActivity(parentId: string, id: string) {
  const r = await one('SELECT * FROM activities WHERE id = $1 AND parent_id = $2', [id, parentId]);
  if (!r) throw new HttpError(404, 'Activity not found.');
  return toActivity(r);
}

export async function getAssignment(parentId: string, id: string) {
  const r = await one('SELECT * FROM assignments WHERE id = $1 AND parent_id = $2', [id, parentId]);
  if (!r) throw new HttpError(404, 'Assignment not found.');
  return toAssignment(r);
}

/** A caregiver's assignments for one day, in the order they happen. */
export async function caregiverDay(parentId: string, caregiverId: string, date: string) {
  const rows = await many(
    'SELECT * FROM assignments WHERE parent_id = $1 AND caregiver_id = $2 AND date = $3 ORDER BY created_at',
    [parentId, caregiverId, date]
  );
  return rows.map(toAssignment).sort(byRoutine);
}

async function activitiesById(parentId: string) {
  const rows = await many('SELECT * FROM activities WHERE parent_id = $1', [parentId]);
  return new Map(rows.map((r) => [r.id as string, toActivity(r)]));
}

export async function getDayLog(parentId: string, date: string): Promise<DayLog> {
  return toDayLog(date, await one('SELECT * FROM day_logs WHERE parent_id = $1 AND date = $2', [parentId, date]));
}

export async function upsertDayLog(parentId: string, date: string, patch: Partial<Omit<DayLog, 'date'>>) {
  const next = { ...(await getDayLog(parentId, date)), ...patch };
  await exec(
    `INSERT INTO day_logs (parent_id, date, nap, illness, notes) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (parent_id, date) DO UPDATE SET nap = EXCLUDED.nap, illness = EXCLUDED.illness, notes = EXCLUDED.notes`,
    [parentId, date, next.nap, next.illness, next.notes]
  );
  return next;
}

export async function addAlert(
  parentId: string,
  a: { caregiverId: string | null; kind: Alert['kind']; text: string; date: string; refId?: string }
) {
  await exec(
    `INSERT INTO alerts (parent_id, caregiver_id, kind, text, date, ref_id) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (parent_id, ref_id) WHERE ref_id IS NOT NULL DO NOTHING`,
    [parentId, a.caregiverId, a.kind, a.text, a.date, a.refId ?? null]
  );
}

// ---------------------------------------------------------------------------
// In-app messages between the parent and a caregiver
// ---------------------------------------------------------------------------

export async function postMessage(m: {
  parentId: string;
  caregiverId: string;
  direction: MessageDirection;
  kind: MessageKind;
  body: string;
  english?: string | null;
}): Promise<Message> {
  const row = await one(
    `INSERT INTO messages (parent_id, caregiver_id, direction, kind, body, english, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'sent') RETURNING *`,
    [m.parentId, m.caregiverId, m.direction, m.kind, m.body, m.english && m.english !== m.body ? m.english : null]
  );
  return toMessage(row!);
}

/**
 * The latest 200 messages with a caregiver, oldest first. Opening the thread marks what the other
 * side sent as read (`reader` is who is looking).
 */
export async function thread(parentId: string, caregiverId: string, reader: 'parent' | 'caregiver') {
  await exec(
    `UPDATE messages SET status = 'read' WHERE parent_id = $1 AND caregiver_id = $2 AND direction = $3 AND status = 'sent'`,
    [parentId, caregiverId, reader === 'parent' ? 'in' : 'out']
  );
  const rows = await many(
    `SELECT * FROM (
       SELECT * FROM messages WHERE parent_id = $1 AND caregiver_id = $2 ORDER BY created_at DESC LIMIT 200
     ) recent ORDER BY created_at`,
    [parentId, caregiverId]
  );
  return rows.map(toMessage);
}

/** A friendly in-app "how did it go?" reminder in the caregiver's language. */
export async function sendNudge(parent: Parent, a: Assignment) {
  const c = await getCaregiver(parent.id, a.caregiverId);
  const activity = await getActivity(parent.id, a.activityId);
  const message = await postMessage({
    parentId: parent.id,
    caregiverId: c.id,
    direction: 'out',
    kind: 'nudge',
    body: render('appNudge', c.language, { activity: localizedActivity(activity, c.language).title }).text,
    english: render('appNudge', 'en', { activity: localizedActivity(activity, 'en').title }).text,
  });
  await exec('UPDATE assignments SET nudged_at = now() WHERE id = $1', [a.id]);
  return message;
}

/**
 * A message from a caregiver. Every one lands in the parent's inbox; questions only the parent can
 * answer and development worries are flagged as such (TARA never answers or diagnoses them).
 */
export async function caregiverMessage(parent: Parent, c: Caregiver, text: string) {
  const message = await postMessage({ parentId: parent.id, caregiverId: c.id, direction: 'in', kind: 'chat', body: text });
  const today = todayIn(parent.timezone);
  const intent = classify(text);
  const alert = (kind: Alert['kind'], alertText = `${c.name}: “${text}”`) =>
    addAlert(parent.id, { caregiverId: c.id, kind, text: alertText, date: today });

  switch (intent.kind) {
    case 'worry':
      await alert('development-worry');
      break;
    case 'parent-only':
      await alert('parent-question', `${c.name} asks: “${text}”`);
      break;
    case 'goal-request':
      await alert('goal-idea', `${c.name} suggests: “${text}”`);
      break;
    case 'sick':
      await upsertDayLog(parent.id, today, { illness: true });
      await alert('illness');
      break;
    default:
      await alert('message');
  }
  return message;
}

// ---------------------------------------------------------------------------
// The caregiver's side of the app
// ---------------------------------------------------------------------------

export async function caregiverMe(parent: Parent, c: Caregiver): Promise<CaregiverMe> {
  const caregiverRow = (await one('SELECT * FROM caregivers WHERE id = $1', [c.id]))!;
  const unread = await one<{ n: string }>(
    `SELECT count(*) AS n FROM messages WHERE caregiver_id = $1 AND direction = 'out' AND status = 'sent'`,
    [c.id]
  );
  return {
    caregiver: toCaregiverProfile(caregiverRow),
    family: {
      parentName: parent.name,
      parentPhone: parent.phone,
      childName: parent.childName,
      childAgeMonths: parent.childAgeMonths,
    },
    today: todayIn(parent.timezone),
    unread: Number(unread?.n ?? 0),
  };
}

/** One day for a caregiver, in their language, with only what the parent agreed to share. */
export async function caregiverDayView(parent: Parent, c: Caregiver, date: string): Promise<CaregiverDay> {
  const lang = c.language;
  const today = todayIn(parent.timezone);
  const activities = await activitiesById(parent.id);
  const assignments = await caregiverDay(parent.id, c.id, date);

  const items = assignments.flatMap((assignment) => {
    const activity = activities.get(assignment.activityId);
    if (!activity) return [];
    const local = localizedActivity(activity, lang);
    return [{ assignment, title: local.title, steps: local.steps, safety: local.safety, minutes: activity.minutes }];
  });

  let goals: string[] | null = null;
  if (c.seesGoals) {
    const rows = (await many('SELECT * FROM goals WHERE parent_id = $1 AND active ORDER BY created_at', [parent.id])).map(toGoal);
    goals = [...new Set(rows.map((g) => (lang === 'en' ? g.title : GOAL_NAMES[g.area][lang])))];
  }

  const log = await getDayLog(parent.id, date);

  // "No context at handoff → share a short note": what other caregivers reported earlier today.
  let handoff: CaregiverDay['handoff'] = null;
  if (c.seesDayDetails && date === today) {
    const others = (
      await many(
        `SELECT * FROM assignments WHERE parent_id = $1 AND date = $2 AND caregiver_id <> $3
         AND status IN ('done', 'changed', 'skipped')`,
        [parent.id, date, c.id]
      )
    ).map(toAssignment);
    const titles = (statuses: string[]) =>
      others
        .filter((a) => statuses.includes(a.status))
        .map((a) => activities.get(a.activityId))
        .filter((a): a is Activity => !!a)
        .map((a) => localizedActivity(a, lang).title);
    handoff = { done: titles(['done', 'changed']), skipped: titles(['skipped']), nap: log.nap, illness: log.illness };
  }

  const weekStart = startOfWeek(date);
  const marked = (
    await many<{ date: string }>(
      'SELECT DISTINCT date FROM assignments WHERE caregiver_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date',
      [c.id, weekStart, addDays(weekStart, 6)]
    )
  ).map((r) => r.date);

  return { date, items, goals, handoff, dayLog: { nap: log.nap, illness: log.illness }, marked };
}

/** A caregiver records how an activity went (or undoes that). */
export async function caregiverReport(
  parent: Parent,
  c: Caregiver,
  assignmentId: string,
  patch: { status?: 'done' | 'skipped' | 'changed' | 'planned'; reaction?: Assignment['reaction']; note?: string | null }
) {
  const row = await one('SELECT * FROM assignments WHERE id = $1 AND caregiver_id = $2', [assignmentId, c.id]);
  if (!row) throw new HttpError(404, 'Activity not found.');
  const current = toAssignment(row);
  if (current.date > todayIn(parent.timezone)) {
    throw new HttpError(400, `This one is for ${prettyDate(current.date)}. You can mark it then.`);
  }
  const reporting = patch.status && patch.status !== 'planned' && patch.status !== current.status;
  await exec(
    `UPDATE assignments SET
       status = COALESCE($2, status),
       reaction = CASE WHEN $3 THEN $4::reaction ELSE reaction END,
       caregiver_note = CASE WHEN $5 THEN $6 ELSE caregiver_note END,
       reported_at = CASE WHEN $7 THEN now() WHEN $2 = 'planned' THEN NULL ELSE reported_at END
     WHERE id = $1`,
    [
      assignmentId,
      patch.status ?? null,
      patch.reaction !== undefined,
      patch.reaction ?? null,
      patch.note !== undefined,
      patch.note ?? null,
      !!reporting,
    ]
  );
  return toAssignment((await one('SELECT * FROM assignments WHERE id = $1', [assignmentId]))!);
}

/** A caregiver logs a nap or that the child seems unwell (that also alerts the parent). */
export async function caregiverDayLog(parent: Parent, c: Caregiver, patch: { nap?: boolean | null; illness?: boolean }) {
  const today = todayIn(parent.timezone);
  const before = await getDayLog(parent.id, today);
  const next = await upsertDayLog(
    parent.id,
    today,
    Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
  );
  if (patch.illness && !before.illness) {
    await addAlert(parent.id, {
      caregiverId: c.id,
      kind: 'illness',
      text: `${c.name} says ${parent.childName} seems unwell today.`,
      date: today,
    });
  }
  return { nap: next.nap, illness: next.illness };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

async function reportData(parentId: string) {
  const [activities, goals, caregivers] = await Promise.all([
    many('SELECT * FROM activities WHERE parent_id = $1', [parentId]),
    many('SELECT * FROM goals WHERE parent_id = $1', [parentId]),
    many('SELECT * FROM caregivers WHERE parent_id = $1', [parentId]),
  ]);
  return { activities: activities.map(toActivity), goals: goals.map(toGoal), caregivers: caregivers.map(toCaregiver) };
}

export async function dailyReport(parent: Parent, date: string) {
  const [data, assignments, dayLog, alerts] = await Promise.all([
    reportData(parent.id),
    many('SELECT * FROM assignments WHERE parent_id = $1 AND date = $2 ORDER BY created_at', [parent.id, date]),
    getDayLog(parent.id, date),
    many('SELECT * FROM alerts WHERE parent_id = $1 AND date = $2 ORDER BY created_at', [parent.id, date]),
  ]);
  return buildDailyReport({
    parent,
    date,
    ...data,
    assignments: assignments.map(toAssignment),
    dayLog,
    alerts: alerts.map(toAlert),
  });
}

export async function weeklyReport(parent: Parent, end: string) {
  const [data, assignments] = await Promise.all([
    reportData(parent.id),
    many('SELECT * FROM assignments WHERE parent_id = $1 AND date BETWEEN $2 AND $3', [parent.id, addDays(end, -13), end]),
  ]);
  return buildWeeklyReport({ end, ...data, assignments: assignments.map(toAssignment) });
}

// ---------------------------------------------------------------------------
// "No report → one quick reminder, then tell parent": a background sweep
// ---------------------------------------------------------------------------

/** Rough clock time of each routine moment, used to decide when a report is overdue. */
const ANCHOR_HOUR: Record<string, number> = {
  'after-breakfast': 9,
  'mid-morning': 10.5,
  'before-nap': 12.5,
  'after-nap': 15.5,
  'before-dinner': 17.5,
  'bath-time': 19.5,
};

function hourIn(timezone: string, at = new Date()) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
        .formatToParts(at)
        .map((p) => [p.type, p.value])
    );
    return Number(parts.hour) + Number(parts.minute) / 60;
  } catch {
    return at.getUTCHours();
  }
}

export async function sweepMissingReports({ autoNudge }: { autoNudge: boolean }) {
  const parents = (await many('SELECT * FROM parents')).map(toParent);
  for (const parent of parents) {
    const today = todayIn(parent.timezone);
    const hour = hourIn(parent.timezone);
    // Only caregivers who can see the plan (they've joined and aren't paused).
    const open = (
      await many(
        `SELECT a.* FROM assignments a JOIN caregivers c ON c.id = a.caregiver_id
         WHERE a.parent_id = $1 AND a.status IN ('planned', 'sent') AND a.date BETWEEN $2 AND $3 AND c.status = 'joined'`,
        [parent.id, addDays(today, -2), today]
      )
    ).map(toAssignment);

    for (const a of open) {
      const overdueBy = a.date < today ? 24 : hour - (ANCHOR_HOUR[a.anchor] ?? 12);
      if (autoNudge && !a.nudgedAt && overdueBy >= 1) {
        await sendNudge(parent, a).catch((err) => console.warn(`[sweep] reminder failed: ${(err as Error).message}`));
        continue;
      }
      // After the reminder (or, with reminders off, the next day), tell the parent.
      const nudgedLongAgo = a.nudgedAt && Date.now() - Date.parse(a.nudgedAt) > 2 * 3600_000;
      if (nudgedLongAgo || a.date < today) {
        const c = await getCaregiver(parent.id, a.caregiverId);
        const r = await one('SELECT title FROM activities WHERE id = $1', [a.activityId]);
        await addAlert(parent.id, {
          caregiverId: c.id,
          kind: 'no-report',
          text: `No report from ${c.name} on “${r?.title ?? 'an activity'}” (${anchorById(a.anchor).label.en.toLowerCase()}, ${prettyDate(a.date)}).`,
          date: a.date,
          refId: `no-report:${a.id}`,
        });
      }
    }
  }
}
