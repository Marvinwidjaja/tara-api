/**
 * Response schemas for the API docs. Each one is checked at compile time against the matching
 * type in src/shared/types.ts (see the `Same<>` assertions at the bottom), so the docs can't
 * drift from what the API actually returns without `npm run typecheck` failing.
 */
import { z } from 'zod';

import { GOALS, ROUTINE_ANCHORS } from '../shared/library.js';
import type * as T from '../shared/types.js';
import { WEEKDAYS } from '../shared/types.js';

/** Schemas registered here become #/components/schemas/<id> in the OpenAPI document. */
export const registry = z.registry<{ id: string; description?: string }>();
const named = <S extends z.ZodType>(id: string, description: string, schema: S) => {
  registry.add(schema, { id, description });
  return schema;
};

const uuid = z.uuid();
const isoDate = z.string().meta({ format: 'date', example: '2026-11-10' });
const timestamp = z.iso.datetime();

export const Language = named('Language', 'en = English, es = Spanish, zh = Mandarin, tl = Tagalog.', z.enum(['en', 'es', 'zh', 'tl']));
export const DevArea = named(
  'DevArea',
  'Development area of a goal.',
  z.enum(GOALS.map((g) => g.id) as [T.DevArea, ...T.DevArea[]])
);
export const RoutineAnchor = named(
  'RoutineAnchor',
  'Moment in the day an activity is tied to.',
  z.enum(ROUTINE_ANCHORS.map((a) => a.id) as [T.RoutineAnchorId, ...T.RoutineAnchorId[]])
);

export const Parent = named(
  'Parent',
  'A signed-in parent and their child.',
  z.object({
    id: uuid,
    name: z.string(),
    email: z.email(),
    phone: z.string().nullable().meta({ description: 'E.164. Shown to caregivers so they can call.' }),
    childName: z.string(),
    childAgeMonths: z.number().int(),
    timezone: z.string().meta({ example: 'America/New_York' }),
  })
);

const caregiverShape = {
  id: uuid,
  name: z.string(),
  relation: z.string(),
  email: z.email().nullable().meta({ description: 'The email they sign in with, once they have joined.' }),
  language: Language,
  days: z.array(z.enum(WEEKDAYS)),
  seesGoals: z.boolean(),
  seesDayDetails: z.boolean(),
};

export const Caregiver = named(
  'Caregiver',
  'Someone who looks after the child and uses the TARA app with their own login.',
  z.object({
    ...caregiverShape,
    phone: z.string().nullable().meta({ description: 'E.164, optional', example: '+14155550123' }),
    status: z.enum(['not-invited', 'invited', 'joined', 'stopped']).meta({
      description: 'invited = has an invite code. joined = created their login. stopped = the parent paused their access.',
    }),
    inviteCode: z.string().nullable().meta({ description: 'Current invite code; null when none or expired.', example: 'ABCD2345' }),
    inviteExpiresAt: timestamp.nullable(),
  })
);

export const CaregiverProfile = named(
  'CaregiverProfile',
  'What a caregiver sees about themselves.',
  z.object(caregiverShape)
);

export const Goal = named(
  'Goal',
  'Something the parent wants the child to work on.',
  z.object({ id: uuid, title: z.string(), area: DevArea, notes: z.string(), active: z.boolean() })
);

export const Activity = named(
  'Activity',
  'An activity caregivers can be assigned. Library activities are sent in the caregiver’s language.',
  z.object({
    id: uuid,
    goalId: uuid.nullable(),
    title: z.string(),
    steps: z.array(z.string()),
    minutes: z.number().int(),
    safetyNote: z.string(),
    libraryId: z.string().nullable().meta({ description: 'Set when copied from the reviewed library (keeps translations).' }),
  })
);

const AssignmentStatus = z.enum(['planned', 'sent', 'done', 'skipped', 'changed', 'voice']).meta({
  description: 'planned (waiting for the caregiver) → done / skipped / changed. sent and voice come from the old WhatsApp flow.',
});
const Reaction = z.enum(['loved', 'ok', 'not-today']);

const assignmentShape = {
  id: uuid,
  caregiverId: uuid,
  activityId: uuid,
  date: isoDate,
  anchor: RoutineAnchor,
  note: z.string().meta({ description: 'Note from the parent, shown to the caregiver.' }),
  status: AssignmentStatus,
  reaction: Reaction.nullable(),
  caregiverNote: z.string().nullable(),
  voiceNoteUrl: z.string().nullable(),
  sentAt: timestamp.nullable(),
  reportedAt: timestamp.nullable(),
  nudgedAt: timestamp.nullable(),
};
export const Assignment = named('Assignment', 'One activity for one caregiver on one day.', z.object(assignmentShape));

export const Message = named(
  'Message',
  'A message in the in-app chat between the parent and a caregiver.',
  z.object({
    id: uuid,
    caregiverId: uuid.nullable(),
    direction: z.enum(['out', 'in']).meta({ description: 'out = parent or TARA reminder → caregiver; in = caregiver → parent.' }),
    kind: z.enum(['invite', 'plan', 'chat', 'nudge', 'reply', 'summary']).meta({
      description: 'chat = written by a person, nudge = TARA reminder. Others are from the old WhatsApp flow.',
    }),
    body: z.string(),
    english: z.string().nullable().meta({ description: 'English copy for the parent, when the body is in another language.' }),
    status: z.enum(['sent', 'read']).meta({ description: 'read = the other side has opened the conversation since.' }),
    mediaUrl: z.string().nullable(),
    createdAt: timestamp,
  })
);

export const Alert = named(
  'Alert',
  'Something in the parent’s inbox: questions and worries from caregivers always come to the parent.',
  z.object({
    id: uuid,
    caregiverId: uuid.nullable(),
    kind: z.enum(['parent-question', 'development-worry', 'goal-idea', 'no-report', 'illness', 'message']),
    text: z.string(),
    date: isoDate,
    resolved: z.boolean(),
    createdAt: timestamp,
  })
);

export const DayLog = named(
  'DayLog',
  'Nap, illness and notes for one day.',
  z.object({ date: isoDate, nap: z.boolean().nullable(), illness: z.boolean(), notes: z.string() })
);

export const DailyReport = named(
  'DailyReport',
  'How one day went.',
  z.object({
    date: isoDate,
    summary: z.string().meta({ example: 'Tue, Nov 10: 1 of 2 activities done. Mia loved Block tower. Napped.' }),
    planned: z.number().int(),
    done: z.number().int(),
    skipped: z.number().int(),
    pending: z.number().int(),
    dayLog: DayLog,
    items: z.array(
      z.object({
        ...assignmentShape,
        activityTitle: z.string(),
        caregiverName: z.string(),
        goalTitle: z.string().nullable(),
      })
    ),
    alerts: z.array(Alert),
  })
);

export const WeeklyReport = named(
  'WeeklyReport',
  'The 7 days ending on `end`, compared with the 7 days before.',
  z.object({
    start: isoDate,
    end: isoDate,
    days: z.array(z.object({ date: isoDate, planned: z.number().int(), done: z.number().int() })),
    planned: z.number().int(),
    done: z.number().int(),
    completionRate: z.number().meta({ description: '0–1' }),
    previousCompletionRate: z.number().nullable(),
    previousPlanned: z.number().int(),
    byGoal: z.array(z.object({ goalId: uuid.nullable(), title: z.string(), planned: z.number().int(), done: z.number().int() })),
    byCaregiver: z.array(z.object({ caregiverId: uuid, name: z.string(), planned: z.number().int(), reported: z.number().int() })),
    loved: z.array(z.string()).meta({ description: 'Activity titles the child loved, most often first.' }),
  })
);

// --- The caregiver's side ------------------------------------------------------------

export const CaregiverMe = named(
  'CaregiverMe',
  'What a signed-in caregiver needs on launch.',
  z.object({
    caregiver: CaregiverProfile,
    family: z.object({
      parentName: z.string(),
      parentPhone: z.string().nullable(),
      childName: z.string(),
      childAgeMonths: z.number().int(),
    }),
    today: isoDate.meta({ description: 'Today in the family’s time zone.' }),
    unread: z.number().int().meta({ description: 'Messages from the parent not opened yet.' }),
  })
);

export const CaregiverDay = named(
  'CaregiverDay',
  'One day of activities for the caregiver, in their language, with only what the parent shares.',
  z.object({
    date: isoDate,
    items: z.array(
      z.object({
        assignment: Assignment,
        title: z.string(),
        steps: z.array(z.string()),
        safety: z.string(),
        minutes: z.number().int(),
      })
    ),
    goals: z.array(z.string()).nullable().meta({ description: 'null when the parent doesn’t share goals.' }),
    handoff: z
      .object({ done: z.array(z.string()), skipped: z.array(z.string()), nap: z.boolean().nullable(), illness: z.boolean() })
      .nullable()
      .meta({ description: 'What other caregivers reported today. null unless shared and the day is today.' }),
    dayLog: z.object({ nap: z.boolean().nullable(), illness: z.boolean() }),
    marked: z.array(isoDate).meta({ description: 'Days that week with activities for this caregiver.' }),
  })
);

export const InvitePreview = named(
  'InvitePreview',
  'Who an invite code is from.',
  z.object({ caregiverName: z.string(), parentName: z.string(), childName: z.string() })
);

export const CaregiverAuthResult = named(
  'CaregiverAuthResult',
  'A new caregiver session.',
  z.object({ token: z.string(), caregiver: CaregiverProfile })
);

// --- Shapes that only exist in responses -------------------------------------------

export const AuthResult = named('AuthResult', 'A new session.', z.object({ token: z.string(), parent: Parent }));

export const Bootstrap = named(
  'Bootstrap',
  'Everything the app needs on launch.',
  z.object({
    parent: Parent,
    today: isoDate.meta({ description: 'Today in the parent’s time zone.' }),
    caregivers: z.array(Caregiver),
    goals: z.array(Goal),
    activities: z.array(Activity),
    alerts: z.array(Alert).meta({ description: 'Open (unresolved) alerts, newest first.' }),
  })
);

export const LibraryItem = named(
  'LibraryItem',
  'A reviewed activity that can be copied with POST /api/activities/from-library.',
  z.object({ id: z.string(), title: z.string(), area: DevArea })
);

export const Ok = named('Ok', 'Success with nothing else to return.', z.object({ ok: z.literal(true) }));
export const Health = named('Health', 'Server and database are up.', z.object({ ok: z.literal(true) }));
export const Error = named(
  'Error',
  'Every error response. The message is written to be shown to the parent as-is.',
  z.object({ error: z.string().meta({ example: 'Please sign in again.' }) })
);

// --- Compile-time checks: docs schemas ≡ src/shared/types.ts --------------------------

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const same = <_ extends true>() => undefined;
same<Same<z.infer<typeof Parent>, T.Parent>>();
same<Same<z.infer<typeof Caregiver>, T.Caregiver>>();
same<Same<z.infer<typeof Goal>, T.Goal>>();
same<Same<z.infer<typeof Activity>, T.Activity>>();
same<Same<z.infer<typeof Assignment>, T.Assignment>>();
same<Same<z.infer<typeof Message>, T.Message>>();
same<Same<z.infer<typeof Alert>, T.Alert>>();
same<Same<z.infer<typeof DayLog>, T.DayLog>>();
same<Same<z.infer<typeof DailyReport>, T.DailyReport>>();
same<Same<z.infer<typeof WeeklyReport>, T.WeeklyReport>>();
same<Same<z.infer<typeof CaregiverProfile>, T.CaregiverProfile>>();
same<Same<z.infer<typeof CaregiverMe>, T.CaregiverMe>>();
same<Same<z.infer<typeof CaregiverDay>, T.CaregiverDay>>();
same<Same<z.infer<typeof InvitePreview>, T.InvitePreview>>();
