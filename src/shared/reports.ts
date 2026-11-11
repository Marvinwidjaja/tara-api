// Synced from the Expo app (TARA/src/shared/reports.ts) by `npm run sync-shared`. Edit it there.
/**
 * Daily and weekly reports as pure functions over plain records, shared by the server (SQLite)
 * and the app's demo mode (in-memory fake data), so both produce identical reports.
 */
import { ROUTINE_ANCHORS } from './library.js';
import type {
  Activity,
  Alert,
  Assignment,
  Caregiver,
  DailyReport,
  DayLog,
  Goal,
  Parent,
  WeeklyReport,
} from './types.js';

const ANCHOR_ORDER = ROUTINE_ANCHORS.map((a) => a.id);

/** Order of activities within a day (this is also the numbering in caregiver texts). */
export const byRoutine = (a: Assignment, b: Assignment) =>
  ANCHOR_ORDER.indexOf(a.anchor) - ANCHOR_ORDER.indexOf(b.anchor);

export function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function prettyDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export const isDone = (a: Assignment) => a.status === 'done' || a.status === 'changed';

type DailyInput = {
  parent: Parent;
  date: string;
  /** That day's assignments, any order. */
  assignments: Assignment[];
  activities: Activity[];
  goals: Goal[];
  caregivers: Caregiver[];
  dayLog: DayLog;
  /** That day's alerts, oldest first. */
  alerts: Alert[];
};

export function buildDailyReport(input: DailyInput): DailyReport {
  const { parent, date, dayLog, alerts } = input;
  const activities = new Map(input.activities.map((a) => [a.id, a]));
  const goals = new Map(input.goals.map((g) => [g.id, g]));
  const caregivers = new Map(input.caregivers.map((c) => [c.id, c]));
  const items = [...input.assignments].sort(byRoutine).map((a) => {
    const activity = activities.get(a.activityId);
    return {
      ...a,
      activityTitle: activity?.title ?? 'Deleted activity',
      caregiverName: caregivers.get(a.caregiverId)?.name ?? 'Former caregiver',
      goalTitle: activity?.goalId ? (goals.get(activity.goalId)?.title ?? null) : null,
    };
  });

  const done = items.filter(isDone);
  const skipped = items.filter((i) => i.status === 'skipped');
  const voice = items.filter((i) => i.status === 'voice');
  const pending = items.filter((i) => i.status === 'planned' || i.status === 'sent');

  const child = parent.childName;
  const lines: string[] = [];
  if (items.length === 0) {
    lines.push(`${prettyDate(date)}: no activities were planned.`);
  } else {
    lines.push(`${prettyDate(date)}: ${done.length} of ${items.length} activities done.`);
    const loved = items.filter((i) => i.reaction === 'loved');
    if (loved.length) lines.push(`${child} loved ${loved.map((i) => i.activityTitle).join(' and ')}.`);
    const notToday = items.filter((i) => i.reaction === 'not-today');
    if (notToday.length) lines.push(`Not ${child}'s thing today: ${notToday.map((i) => i.activityTitle).join(', ')}.`);
    if (skipped.length) lines.push(`Skipped: ${skipped.map((i) => i.activityTitle).join(', ')}.`);
    if (voice.length) lines.push(`${voice.length} voice note${voice.length === 1 ? '' : 's'} to listen to.`);
    if (pending.length) {
      lines.push(`No report yet: ${pending.map((i) => `${i.activityTitle} (${i.caregiverName})`).join(', ')}.`);
    }
    for (const i of items.filter((i) => i.caregiverNote)) {
      lines.push(`${i.caregiverName} on ${i.activityTitle}: “${i.caregiverNote}”.`);
    }
  }
  if (dayLog.nap !== null) lines.push(dayLog.nap ? 'Napped.' : 'No nap.');
  if (dayLog.illness) lines.push('Seemed unwell.');
  if (dayLog.notes) lines.push(`Notes: ${dayLog.notes}`);
  const questions = alerts.filter((a) => !a.resolved && a.kind !== 'message' && a.kind !== 'no-report');
  if (questions.length) lines.push(`${questions.length} item${questions.length === 1 ? '' : 's'} waiting for you in TARA.`);

  return {
    date,
    summary: lines.join(' '),
    planned: items.length,
    done: done.length,
    skipped: skipped.length,
    pending: pending.length + voice.length,
    dayLog,
    items,
    alerts,
  };
}

type WeeklyInput = {
  end: string;
  /** Assignments from at least `end - 13` to `end` (older or newer rows are ignored). */
  assignments: Assignment[];
  activities: Activity[];
  goals: Goal[];
  caregivers: Caregiver[];
};

/** The 7 days ending on `end`, compared with the 7 days before. */
export function buildWeeklyReport(input: WeeklyInput): WeeklyReport {
  const { end } = input;
  const start = addDays(end, -6);
  const prevStart = addDays(end, -13);
  const prevEnd = addDays(end, -7);
  const rows = input.assignments.filter((r) => r.date >= start && r.date <= end);
  const prev = input.assignments.filter((r) => r.date >= prevStart && r.date <= prevEnd);
  const activities = new Map(input.activities.map((a) => [a.id, a]));

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const dayRows = rows.filter((r) => r.date === date);
    return { date, planned: dayRows.length, done: dayRows.filter(isDone).length };
  });

  const goalBuckets = new Map<string | null, { planned: number; done: number }>();
  for (const r of rows) {
    const goalId = activities.get(r.activityId)?.goalId ?? null;
    const bucket = goalBuckets.get(goalId) ?? { planned: 0, done: 0 };
    bucket.planned += 1;
    if (isDone(r)) bucket.done += 1;
    goalBuckets.set(goalId, bucket);
  }

  const loved = new Map<string, number>();
  for (const r of rows.filter((r) => r.reaction === 'loved')) {
    const title = activities.get(r.activityId)?.title;
    if (title) loved.set(title, (loved.get(title) ?? 0) + 1);
  }

  const done = rows.filter(isDone).length;
  return {
    start,
    end,
    days,
    planned: rows.length,
    done,
    completionRate: rows.length ? done / rows.length : 0,
    previousPlanned: prev.length,
    previousCompletionRate: prev.length ? prev.filter(isDone).length / prev.length : null,
    byGoal: [...goalBuckets.entries()].map(([goalId, b]) => ({
      goalId,
      title: goalId ? (input.goals.find((g) => g.id === goalId)?.title ?? 'Deleted goal') : 'No goal',
      ...b,
    })),
    byCaregiver: input.caregivers
      .map((c) => {
        const mine = rows.filter((r) => r.caregiverId === c.id);
        return {
          caregiverId: c.id,
          name: c.name,
          planned: mine.length,
          reported: mine.filter((r) => !['planned', 'sent'].includes(r.status)).length,
        };
      })
      .filter((c) => c.planned > 0),
    loved: [...loved.entries()].sort((a, b) => b[1] - a[1]).map(([title]) => title),
  };
}
