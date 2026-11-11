-- Caregivers sign in to the app instead of getting WhatsApp/SMS messages.
--   * caregivers get their own login (email + password), created with an invite code from the parent
--   * sessions can belong to a caregiver (caregiver_id set) or the parent (caregiver_id null)
--   * messages are in-app only: no Twilio ids, delivery errors or channels

ALTER TABLE caregivers
  ADD COLUMN email              text,
  ADD COLUMN password_hash      text,
  ADD COLUMN invite_code        text,
  ADD COLUMN invite_expires_at  timestamptz,
  ALTER COLUMN phone DROP NOT NULL,
  DROP COLUMN channel;
DROP TYPE channel;
CREATE UNIQUE INDEX caregivers_email_key ON caregivers (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX caregivers_invite_code_key ON caregivers (invite_code) WHERE invite_code IS NOT NULL;

-- Nobody has an app login yet, so everyone starts over with an invite code.
UPDATE caregivers SET status = 'not-invited' WHERE status IN ('invited', 'joined');

ALTER TABLE sessions ADD COLUMN caregiver_id uuid REFERENCES caregivers (id) ON DELETE CASCADE;
CREATE INDEX sessions_caregiver_idx ON sessions (caregiver_id) WHERE caregiver_id IS NOT NULL;

DROP INDEX messages_sid_idx;
ALTER TABLE messages DROP COLUMN twilio_sid, DROP COLUMN error;
UPDATE messages SET status = 'read';
ALTER TABLE messages ADD CONSTRAINT messages_status_check CHECK (status IN ('sent', 'read'));
