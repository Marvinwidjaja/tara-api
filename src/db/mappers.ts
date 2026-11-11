/** Database rows (snake_case, Dates) → API records (camelCase, ISO strings), matching src/shared/types.ts. */
import type {
  Activity,
  Alert,
  Assignment,
  Caregiver,
  CaregiverProfile,
  DayLog,
  Goal,
  Message,
  Parent,
} from '../shared/types.js';

type Row = Record<string, any>;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

export const toParent = (r: Row): Parent => ({
  id: r.id,
  name: r.name,
  email: r.email,
  phone: r.phone ?? null,
  childName: r.child_name,
  childAgeMonths: Number(r.child_age_months),
  timezone: r.timezone,
});

export const toCaregiver = (r: Row): Caregiver => {
  const inviteLive = !!r.invite_code && !!r.invite_expires_at && new Date(r.invite_expires_at).getTime() > Date.now();
  return {
    id: r.id,
    name: r.name,
    relation: r.relation,
    phone: r.phone ?? null,
    email: r.email ?? null,
    language: r.language,
    days: r.days ?? [],
    status: r.status,
    seesGoals: r.sees_goals,
    seesDayDetails: r.sees_day_details,
    inviteCode: inviteLive ? r.invite_code : null,
    inviteExpiresAt: inviteLive ? iso(r.invite_expires_at) : null,
  };
};

export const toCaregiverProfile = (r: Row): CaregiverProfile => ({
  id: r.id,
  name: r.name,
  relation: r.relation,
  email: r.email ?? null,
  language: r.language,
  days: r.days ?? [],
  seesGoals: r.sees_goals,
  seesDayDetails: r.sees_day_details,
});

export const toGoal = (r: Row): Goal => ({
  id: r.id,
  title: r.title,
  area: r.area,
  notes: r.notes,
  active: r.active,
});

export const toActivity = (r: Row): Activity => ({
  id: r.id,
  goalId: r.goal_id ?? null,
  title: r.title,
  steps: r.steps ?? [],
  minutes: Number(r.minutes),
  safetyNote: r.safety_note,
  libraryId: r.library_id ?? null,
});

export const toAssignment = (r: Row): Assignment => ({
  id: r.id,
  caregiverId: r.caregiver_id,
  activityId: r.activity_id,
  date: r.date,
  anchor: r.anchor,
  note: r.note,
  status: r.status,
  reaction: r.reaction ?? null,
  caregiverNote: r.caregiver_note ?? null,
  voiceNoteUrl: r.voice_note_url ?? null,
  sentAt: iso(r.sent_at),
  reportedAt: iso(r.reported_at),
  nudgedAt: iso(r.nudged_at),
});

export const toMessage = (r: Row): Message => ({
  id: r.id,
  caregiverId: r.caregiver_id ?? null,
  direction: r.direction,
  kind: r.kind,
  body: r.body,
  english: r.english ?? null,
  status: r.status,
  mediaUrl: r.media_url ?? null,
  createdAt: iso(r.created_at)!,
});

export const toAlert = (r: Row): Alert => ({
  id: r.id,
  caregiverId: r.caregiver_id ?? null,
  kind: r.kind,
  text: r.text,
  date: r.date,
  resolved: r.resolved,
  createdAt: iso(r.created_at)!,
});

export const toDayLog = (date: string, r: Row | undefined): DayLog => ({
  date,
  nap: r?.nap ?? null,
  illness: !!r?.illness,
  notes: r?.notes ?? '',
});
