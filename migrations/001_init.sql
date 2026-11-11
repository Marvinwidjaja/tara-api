-- CoCare schema. Applied by `npm run migrate` (each file runs once, in order, in a transaction).

CREATE TABLE parents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  email             text NOT NULL,
  password_hash     text NOT NULL,
  phone             text,
  child_name        text NOT NULL,
  child_age_months  integer NOT NULL CHECK (child_age_months BETWEEN 0 AND 96),
  timezone          text NOT NULL DEFAULT 'UTC',
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX parents_email_key ON parents (lower(email));
CREATE INDEX parents_phone_idx ON parents (phone);

-- Only a SHA-256 hash of each session token is stored.
CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  parent_id   uuid NOT NULL REFERENCES parents (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_parent_idx ON sessions (parent_id);

CREATE TYPE language AS ENUM ('en', 'es', 'zh', 'tl');
CREATE TYPE channel AS ENUM ('whatsapp', 'sms');
CREATE TYPE caregiver_status AS ENUM ('not-invited', 'invited', 'joined', 'stopped');

CREATE TABLE caregivers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id         uuid NOT NULL REFERENCES parents (id) ON DELETE CASCADE,
  name              text NOT NULL,
  relation          text NOT NULL DEFAULT '',
  phone             text NOT NULL,
  language          language NOT NULL DEFAULT 'en',
  channel           channel NOT NULL DEFAULT 'whatsapp',
  days              text[] NOT NULL DEFAULT '{}',
  status            caregiver_status NOT NULL DEFAULT 'not-invited',
  sees_goals        boolean NOT NULL DEFAULT false,
  sees_day_details  boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX caregivers_parent_idx ON caregivers (parent_id);
CREATE INDEX caregivers_phone_idx ON caregivers (phone);

CREATE TABLE goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid NOT NULL REFERENCES parents (id) ON DELETE CASCADE,
  title       text NOT NULL,
  area        text NOT NULL CHECK (area IN ('language', 'motor', 'social', 'sensory', 'thinking', 'self-care')),
  notes       text NOT NULL DEFAULT '',
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX goals_parent_idx ON goals (parent_id);

CREATE TABLE activities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    uuid NOT NULL REFERENCES parents (id) ON DELETE CASCADE,
  goal_id      uuid REFERENCES goals (id) ON DELETE SET NULL,
  title        text NOT NULL,
  steps        text[] NOT NULL DEFAULT '{}',
  minutes      integer NOT NULL DEFAULT 10 CHECK (minutes BETWEEN 1 AND 240),
  safety_note  text NOT NULL DEFAULT '',
  library_id   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_parent_idx ON activities (parent_id);
CREATE UNIQUE INDEX activities_library_key ON activities (parent_id, library_id) WHERE library_id IS NOT NULL;

CREATE TYPE assignment_status AS ENUM ('planned', 'sent', 'done', 'skipped', 'changed', 'voice');
CREATE TYPE reaction AS ENUM ('loved', 'ok', 'not-today');

CREATE TABLE assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id        uuid NOT NULL REFERENCES parents (id) ON DELETE CASCADE,
  caregiver_id     uuid NOT NULL REFERENCES caregivers (id) ON DELETE CASCADE,
  activity_id      uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  date             date NOT NULL,
  anchor           text NOT NULL CHECK (anchor IN ('after-breakfast', 'mid-morning', 'before-nap', 'after-nap', 'before-dinner', 'bath-time')),
  note             text NOT NULL DEFAULT '',
  status           assignment_status NOT NULL DEFAULT 'planned',
  reaction         reaction,
  caregiver_note   text,
  voice_note_url   text,
  sent_at          timestamptz,
  reported_at      timestamptz,
  nudged_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignments_day_idx ON assignments (parent_id, date);
CREATE INDEX assignments_caregiver_day_idx ON assignments (caregiver_id, date);

CREATE TYPE message_direction AS ENUM ('out', 'in');

CREATE TABLE messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     uuid NOT NULL REFERENCES parents (id) ON DELETE CASCADE,
  caregiver_id  uuid REFERENCES caregivers (id) ON DELETE CASCADE,
  direction     message_direction NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('invite', 'plan', 'chat', 'nudge', 'reply', 'summary')),
  body          text NOT NULL,
  english       text,
  twilio_sid    text,
  status        text NOT NULL,
  error         text,
  media_url     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_thread_idx ON messages (parent_id, caregiver_id, created_at);
CREATE INDEX messages_sid_idx ON messages (twilio_sid) WHERE twilio_sid IS NOT NULL;

CREATE TABLE alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     uuid NOT NULL REFERENCES parents (id) ON DELETE CASCADE,
  caregiver_id  uuid REFERENCES caregivers (id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('parent-question', 'development-worry', 'goal-idea', 'no-report', 'illness', 'message')),
  text          text NOT NULL,
  date          date NOT NULL,
  ref_id        text,
  resolved      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alerts_open_idx ON alerts (parent_id) WHERE NOT resolved;
CREATE UNIQUE INDEX alerts_ref_key ON alerts (parent_id, ref_id) WHERE ref_id IS NOT NULL;

CREATE TABLE day_logs (
  parent_id  uuid NOT NULL REFERENCES parents (id) ON DELETE CASCADE,
  date       date NOT NULL,
  nap        boolean,
  illness    boolean NOT NULL DEFAULT false,
  notes      text NOT NULL DEFAULT '',
  PRIMARY KEY (parent_id, date)
);
