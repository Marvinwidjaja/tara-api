/** Request body / query schemas (zod). Error messages are shown to parents as-is, so keep them plain. */
import { z } from 'zod';

import { GOALS, ROUTINE_ANCHORS } from './shared/library.js';
import { normalizePhone } from './shared/phone.js';
import { WEEKDAYS } from './shared/types.js';

const text = (field: string, max: number) =>
  z.string({ error: `${field} must be text.` }).trim().max(max, `${field} is too long (max ${max} characters).`);
const required = (field: string, max: number) => text(field, max).min(1, `${field} is required.`);

export const phone = (field: string) =>
  z
    .string({ error: `${field} must be text.` })
    .trim()
    .transform((v, ctx) => {
      const normalized = normalizePhone(v);
      if (!normalized) {
        ctx.addIssue({ code: 'custom', message: `${field} must include the country code, like +1 415 555 0123.` });
        return z.NEVER;
      }
      return normalized;
    })
    .meta({ description: 'Phone number with country code. Spaces, dashes and brackets are fine.', example: '+1 415 555 0123' });

/** Optional phone: "" clears it (null), missing leaves it unchanged (undefined). */
const optionalPhone = (field: string) => z.union([z.literal('').transform(() => null), z.null(), phone(field)]).optional();

export const isoDate = (field: string) =>
  z
    .string({ error: `${field} must be a date like 2026-11-09.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${field} must be a date like 2026-11-09.`)
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), `${field} must be a real date.`)
    .meta({ format: 'date', example: '2026-11-10' });

const timezone = z
  .string()
  .trim()
  .max(80)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone.')
  .meta({ description: 'IANA time zone. Decides what "today" means for this family.', example: 'America/New_York' });

const childAge = z.coerce
  .number({ error: "Child's age (months) must be a number." })
  .int("Child's age (months) must be a whole number.")
  .min(0, "Child's age (months) must be 0 or more.")
  .max(96, "Child's age (months) must be 96 or less.");

const area = z.enum(GOALS.map((g) => g.id) as [string, ...string[]], { error: 'Pick an area for the goal.' });
const anchor = z.enum(ROUTINE_ANCHORS.map((a) => a.id) as [string, ...string[]], { error: 'Pick a time of day.' });
const weekdays = z.array(z.enum(WEEKDAYS), { error: 'Days must be a list like ["Mon", "Tue"].' });
const uuid = (field: string) => z.uuid({ error: `${field} not found.` });

const email = z.email({ error: 'Enter a valid email address.' }).trim().toLowerCase().max(200);
const newPassword = z.string({ error: 'Password is required.' }).min(8, 'Password must be at least 8 characters.').max(200);
const language = z
  .enum(['en', 'es', 'zh', 'tl'], { error: 'Pick a language.' })
  .meta({ description: 'Language the caregiver sees TARA in: English, Spanish, Mandarin, Tagalog.' });

export const signUp = z.object({
  name: required('Your name', 80),
  email,
  password: newPassword,
  phone: optionalPhone('Phone'),
  childName: required("Child's name", 80),
  childAgeMonths: childAge.meta({ example: 18 }),
  timezone: timezone.optional(),
});

export const signIn = z.object({
  email: z.string({ error: 'Email is required.' }).trim().toLowerCase().min(1, 'Email is required.'),
  password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.'),
});

export const updateMe = z.object({
  name: required('Your name', 80).optional(),
  phone: optionalPhone('Phone'),
  childName: required("Child's name", 80).optional(),
  childAgeMonths: childAge.optional(),
  timezone: timezone.optional(),
});

const caregiverFields = {
  name: required('Name', 80),
  relation: text('Relation', 80),
  phone: optionalPhone('Phone'),
  language,
  days: weekdays,
  seesGoals: z.boolean().meta({ description: "Consent: the caregiver sees the parent's goals." }),
  seesDayDetails: z.boolean().meta({ description: 'Consent: the caregiver sees how the day went so far.' }),
};

export const createCaregiver = z.object({
  ...caregiverFields,
  relation: caregiverFields.relation.default(''),
  phone: caregiverFields.phone.transform((v) => v ?? null),
  language: caregiverFields.language.default('en'),
  days: caregiverFields.days.default([]),
  seesGoals: caregiverFields.seesGoals.default(false),
  seesDayDetails: caregiverFields.seesDayDetails.default(false),
});
export const updateCaregiver = z.object({
  ...z.object(caregiverFields).partial().shape,
  paused: z
    .boolean()
    .optional()
    .meta({ description: 'true pauses the caregiver’s access (signs them out); false gives it back.' }),
});

export const message = z.object({ text: required('Message', 1000) });

// --- Caregiver accounts ------------------------------------------------------------

const inviteCode = z
  .string({ error: 'Enter the invite code.' })
  .trim()
  .min(1, 'Enter the invite code.')
  .max(40)
  .meta({ description: 'The code from the parent. Case, spaces and dashes don’t matter.', example: 'ABCD-2345' });

export const caregiverJoin = z.object({ code: inviteCode, email, password: newPassword });

export const caregiverUpdateMe = z.object({ language: language.optional() });

export const caregiverReport = z.object({
  status: z
    .enum(['done', 'skipped', 'changed', 'planned'])
    .optional()
    .meta({ description: 'done, skipped or changed (done another way). planned undoes a report.' }),
  reaction: z.enum(['loved', 'ok', 'not-today']).nullable().optional(),
  note: z
    .union([z.literal('').transform(() => null), z.null(), text('Note', 500)])
    .optional()
    .meta({ description: 'A note for the parent. "" or null removes it.' }),
});

export const caregiverDayLog = z.object({
  nap: z.boolean().nullable().optional(),
  illness: z.boolean().optional().meta({ description: 'true also alerts the parent.' }),
});

export const createGoal = z.object({
  title: required('Goal', 120),
  area,
  notes: text('Notes', 1000).default(''),
});
export const updateGoal = z.object({
  title: required('Goal', 120).optional(),
  area: area.optional(),
  notes: text('Notes', 1000).optional(),
  active: z.boolean().optional(),
});

const steps = z
  .array(text('Each step', 200), { error: 'Steps must be a list of text.' })
  .transform((s) => s.filter(Boolean))
  .refine((s) => s.length <= 8, 'Keep it to 8 steps or fewer, so texts stay short.');
const minutes = z.coerce.number().int().min(1, 'Minutes must be at least 1.').max(240, 'Minutes must be 240 or less.');
const goalRef = z.union([z.literal('').transform(() => null), z.null(), uuid('Goal')]);

export const createActivity = z.object({
  title: required('Activity name', 120),
  steps: steps.default([]),
  minutes: minutes.default(10),
  safetyNote: text('Safety note', 300).default(''),
  goalId: goalRef.default(null),
});
export const updateActivity = z.object({
  title: required('Activity name', 120).optional(),
  steps: steps.optional(),
  minutes: minutes.optional(),
  safetyNote: text('Safety note', 300).optional(),
  goalId: goalRef.optional(),
});
export const fromLibrary = z.object({
  libraryId: required('Library activity', 60).meta({ description: 'An id from GET /api/library.', example: 'block-tower' }),
  goalId: goalRef.default(null),
});

export const assignmentRange = z.object({ from: isoDate('from').optional(), to: isoDate('to').optional() });
export const createAssignment = z.object({
  caregiverId: uuid('Caregiver'),
  activityId: uuid('Activity'),
  date: isoDate('Date'),
  anchor,
  note: text('Note', 300).default(''),
  allowMore: z
    .boolean()
    .default(false)
    .meta({ description: 'Confirms going past the "one or two per shift" guideline (otherwise 409).' }),
});
export const updateAssignment = z.object({
  status: z.enum(['planned', 'sent', 'done', 'skipped', 'changed', 'voice']).optional(),
  reaction: z.enum(['loved', 'ok', 'not-today']).nullable().optional(),
  note: text('Note', 300).optional(),
  date: isoDate('Date').optional(),
  anchor: anchor.optional(),
  caregiverId: uuid('Caregiver').optional(),
  activityId: uuid('Activity').optional(),
});

export const resolveAlert = z.object({ resolved: z.boolean().default(true) });
export const dayLogPatch = z.object({
  nap: z.boolean().nullable().optional(),
  illness: z.boolean().optional(),
  notes: text('Notes', 1000).optional(),
});
export const dateQuery = (key: string) => z.object({ [key]: isoDate(key).optional() });
