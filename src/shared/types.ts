// Synced from the Expo app (TARA/src/shared/types.ts) by `npm run sync-shared`. Edit it there.
/**
 * Types shared by the Expo app and the TARA backend (`TARA_backend`).
 * Keep this file free of React Native imports so the server can load it too.
 */

export type Language = 'en' | 'es' | 'zh' | 'tl';
export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export type Energy = 'active' | 'calm';
export type DevArea = 'language' | 'motor' | 'social' | 'sensory' | 'thinking' | 'self-care';

/** A string in every supported caregiver language. */
export type Localized = Record<Language, string>;

export const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Moments in the day an activity is tied to (labels are translated in the library). */
export type RoutineAnchorId =
  | 'after-breakfast'
  | 'mid-morning'
  | 'before-nap'
  | 'after-nap'
  | 'before-dinner'
  | 'bath-time';

/** A human-reviewed activity from the built-in library (translated into every language). */
export type LibraryActivity = {
  id: string;
  title: Localized;
  steps: Localized[];
  area: DevArea;
  minAgeMonths: number;
  maxAgeMonths: number;
  safetyLabels: Localized[];
  needsItems: string[];
  energy: Energy;
  minutes: number;
  usesSong?: boolean;
  swaps: string[];
};

// ---------------------------------------------------------------------------
// API records (what the server returns as JSON)
// ---------------------------------------------------------------------------

export type Parent = {
  id: string;
  name: string;
  email: string;
  /** E.164 phone number, shown to caregivers so they can call. Optional. */
  phone: string | null;
  childName: string;
  childAgeMonths: number;
  timezone: string;
};

/**
 * not-invited → invited (the parent made an invite code) → joined (the caregiver created their
 * TARA login with it). stopped = the parent paused their access.
 */
export type CaregiverStatus = 'not-invited' | 'invited' | 'joined' | 'stopped';

export type Caregiver = {
  id: string;
  name: string;
  relation: string;
  /** E.164, e.g. +14155550123. Optional, for the parent to call them. */
  phone: string | null;
  /** The email they sign in with, once they've joined. */
  email: string | null;
  /** Language the caregiver sees TARA and their activities in. */
  language: Language;
  days: Weekday[];
  status: CaregiverStatus;
  /** Consent: the caregiver sees the parent's goals. */
  seesGoals: boolean;
  /** Consent: the caregiver sees how the day went so far (handoff details). */
  seesDayDetails: boolean;
  /** Current invite code (null when there's none, or it expired). Shown to the parent only. */
  inviteCode: string | null;
  inviteExpiresAt: string | null;
};

export type Goal = {
  id: string;
  title: string;
  area: DevArea;
  notes: string;
  active: boolean;
};

export type Activity = {
  id: string;
  goalId: string | null;
  title: string;
  steps: string[];
  minutes: number;
  safetyNote: string;
  /** Set when the activity was added from the reviewed library (gives translations). */
  libraryId: string | null;
};

/** planned = waiting for the caregiver (sent = the same, from the old WhatsApp flow). */
export type AssignmentStatus = 'planned' | 'sent' | 'done' | 'skipped' | 'changed' | 'voice';
export type Reaction = 'loved' | 'ok' | 'not-today';

export type Assignment = {
  id: string;
  caregiverId: string;
  activityId: string;
  /** Local date, YYYY-MM-DD */
  date: string;
  anchor: RoutineAnchorId;
  note: string;
  status: AssignmentStatus;
  reaction: Reaction | null;
  caregiverNote: string | null;
  voiceNoteUrl: string | null;
  sentAt: string | null;
  reportedAt: string | null;
  nudgedAt: string | null;
};

/** out = parent (or a TARA reminder) → caregiver, in = caregiver → parent. */
export type MessageDirection = 'out' | 'in';
/** chat = written by a person, nudge = TARA's reminder. The rest are from the old WhatsApp flow. */
export type MessageKind = 'invite' | 'plan' | 'chat' | 'nudge' | 'reply' | 'summary';
/** read = the other side has opened the conversation since. */
export type MessageStatus = 'sent' | 'read';

export type Message = {
  id: string;
  caregiverId: string | null;
  direction: MessageDirection;
  kind: MessageKind;
  body: string;
  /** English copy for the parent when the message is in another language. */
  english: string | null;
  status: MessageStatus;
  mediaUrl: string | null;
  createdAt: string;
};

export type AlertKind = 'parent-question' | 'development-worry' | 'goal-idea' | 'no-report' | 'illness' | 'message';

export type Alert = {
  id: string;
  caregiverId: string | null;
  kind: AlertKind;
  text: string;
  date: string;
  resolved: boolean;
  createdAt: string;
};

export type DayLog = {
  date: string;
  nap: boolean | null;
  illness: boolean;
  notes: string;
};

export type DailyReport = {
  date: string;
  summary: string;
  planned: number;
  done: number;
  skipped: number;
  pending: number;
  dayLog: DayLog;
  items: (Assignment & { activityTitle: string; caregiverName: string; goalTitle: string | null })[];
  alerts: Alert[];
};

export type WeeklyReport = {
  start: string;
  end: string;
  days: { date: string; planned: number; done: number }[];
  planned: number;
  done: number;
  completionRate: number;
  previousCompletionRate: number | null;
  previousPlanned: number;
  byGoal: { goalId: string | null; title: string; planned: number; done: number }[];
  byCaregiver: { caregiverId: string; name: string; planned: number; reported: number }[];
  loved: string[];
};

// ---------------------------------------------------------------------------
// Caregiver side of the app
// ---------------------------------------------------------------------------

/** Who is signed in on this device. */
export type Role = 'parent' | 'caregiver';

/** The parts of a caregiver record the caregiver sees about themselves. */
export type CaregiverProfile = Pick<
  Caregiver,
  'id' | 'name' | 'relation' | 'email' | 'language' | 'days' | 'seesGoals' | 'seesDayDetails'
>;

/** What a signed-in caregiver needs on launch. */
export type CaregiverMe = {
  caregiver: CaregiverProfile;
  family: { parentName: string; parentPhone: string | null; childName: string; childAgeMonths: number };
  /** Today in the family's time zone. */
  today: string;
  /** Messages from the parent the caregiver hasn't opened yet. */
  unread: number;
};

/** One activity in a caregiver's day, already in their language. */
export type CaregiverDayItem = {
  assignment: Assignment;
  title: string;
  steps: string[];
  safety: string;
  minutes: number;
};

export type CaregiverDay = {
  date: string;
  /** In the order they happen. */
  items: CaregiverDayItem[];
  /** The parent's goals in the caregiver's language, or null when the parent doesn't share them. */
  goals: string[] | null;
  /** What other caregivers reported earlier today. Null unless shared and the day is today. */
  handoff: { done: string[]; skipped: string[]; nap: boolean | null; illness: boolean } | null;
  dayLog: { nap: boolean | null; illness: boolean };
  /** Days in the same Monday–Sunday week that have activities for this caregiver. */
  marked: string[];
};

/** Shown on the join screen before the caregiver creates their login. */
export type InvitePreview = { caregiverName: string; parentName: string; childName: string };
