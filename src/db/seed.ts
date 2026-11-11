/**
 * Loads the demo family into the database:
 *   npm run seed     → parent:     jordan@demo.cocare / demo1234
 *                      caregivers: rosa@demo.cocare, li@demo.cocare (same password)
 *                      Tita Joy hasn't joined yet: her invite code is printed at the end.
 * Re-running replaces the demo account; other accounts are untouched.
 */
import { hashPassword, newInviteCode } from '../middleware/auth.js';
import { activityById, DEFAULT_SONG, ROUTINE_ANCHORS } from '../shared/library.js';
import { fill } from '../shared/messages.js';
import { addDays } from '../shared/reports.js';
import { WEEKDAYS, type AssignmentStatus, type Reaction, type RoutineAnchorId } from '../shared/types.js';
import { migrate } from './migrate.js';
import { pool, transaction } from './pool.js';

const EMAIL = 'jordan@demo.cocare';
const PASSWORD = 'demo1234';
const CAREGIVER_EMAILS = ['rosa@demo.cocare', 'li@demo.cocare'];

const tz = process.env.SEED_TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
const weekday = (date: string) => WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];
/** A wall-clock time on `date` in the seed time zone (good enough for demo data). */
const at = (date: string, hour: number, minute = 0) => `${date} ${hour}:${String(minute).padStart(2, '0')}:00 ${tz}`;
/** Timestamps go in as LEAST($n::timestamptz, now()), so "today" history is never in the future. */
const past = (n: number) => `LEAST($${n}::timestamptz, now())`;

async function seed() {
  await migrate({ quiet: true });
  const passwordHash = await hashPassword(PASSWORD);
  const joyCode = newInviteCode();
  await transaction(async (db) => {
    await db.query('DELETE FROM parents WHERE lower(email) = $1', [EMAIL]);
    // Demo caregiver logins left over in another family would block the unique email.
    await db.query('UPDATE caregivers SET email = NULL WHERE lower(email) = ANY($1)', [CAREGIVER_EMAILS]);
    const parent = (
      await db.query(
        `INSERT INTO parents (name, email, password_hash, phone, child_name, child_age_months, timezone)
         VALUES ('Jordan', $1, $2, '+14155550100', 'Mia', 18, $3) RETURNING id`,
        [EMAIL, passwordHash, tz]
      )
    ).rows[0].id as string;

    const caregiver = async (c: Record<string, unknown>) =>
      (
        await db.query(
          `INSERT INTO caregivers (parent_id, name, relation, phone, language, days, status, sees_goals, sees_day_details,
             email, password_hash, invite_code, invite_expires_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CASE WHEN $12::text IS NULL THEN NULL ELSE now() + interval '14 days' END, $13)
           RETURNING id`,
          [
            parent, c.name, c.relation, c.phone, c.language, c.days, c.status, c.seesGoals, c.seesDayDetails,
            c.email ?? null, c.email ? passwordHash : null, c.inviteCode ?? null, at(addDays(today, -15), 9),
          ]
        )
      ).rows[0].id as string;
    const rosa = await caregiver({
      name: 'Rosa', relation: 'Nanny', phone: '+14155550123', language: 'es', email: CAREGIVER_EMAILS[0],
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], status: 'joined', seesGoals: true, seesDayDetails: true,
    });
    const li = await caregiver({
      name: 'Grandpa Li', relation: 'Grandparent', phone: '+14155550124', language: 'zh', email: CAREGIVER_EMAILS[1],
      days: ['Wed', 'Sat', 'Sun'], status: 'joined', seesGoals: false, seesDayDetails: true,
    });
    await caregiver({
      name: 'Tita Joy', relation: 'Aunt', phone: '+639171234567', language: 'tl', inviteCode: joyCode,
      days: ['Thu'], status: 'invited', seesGoals: false, seesDayDetails: false,
    });

    const goal = async (title: string, area: string, notes = '') =>
      (await db.query('INSERT INTO goals (parent_id, title, area, notes) VALUES ($1, $2, $3, $4) RETURNING id', [parent, title, area, notes]))
        .rows[0].id as string;
    const words = await goal('Say more words', 'language', 'Pediatrician said 10+ words by 2 is a good sign. Name things all day.');
    const build = await goal('Build and stack', 'motor');
    const turns = await goal('Take turns', 'social');

    const fromLibrary = async (libraryId: string, goalId: string) => {
      const lib = activityById(libraryId)!;
      return (
        await db.query(
          `INSERT INTO activities (parent_id, goal_id, title, steps, minutes, safety_note, library_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [parent, goalId, lib.title.en, lib.steps.map((s) => fill(s.en, { song: DEFAULT_SONG.en })), lib.minutes, lib.safetyLabels[0]?.en ?? '', lib.id]
        )
      ).rows[0].id as string;
    };
    const songPoint = await fromLibrary('song-point', words);
    const pictureTalk = await fromLibrary('picture-talk', words);
    const blockTower = await fromLibrary('block-tower', build);
    const cupStack = await fromLibrary('cup-stack', build);
    const ballRoll = await fromLibrary('ball-roll', turns);
    const bubbles = await fromLibrary('bubble-chase', build);
    const animals = (
      await db.query(
        `INSERT INTO activities (parent_id, goal_id, title, steps, minutes) VALUES ($1, $2, 'Name the animals', $3, 10) RETURNING id`,
        [parent, words, ['Open the farm book together.', 'Point to an animal, say its name and its sound.', 'Wait a few seconds so Mia can try to copy you.']]
      )
    ).rows[0].id as string;

    // Two weeks of history, today and tomorrow. Last week went better than the week before.
    const plan: Record<string, { days: string[]; anchors: RoutineAnchorId[]; pool: string[]; notes: string[] }> = {
      [rosa]: {
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        anchors: ['after-breakfast', 'before-nap'],
        pool: [songPoint, blockTower, animals, cupStack, pictureTalk, ballRoll],
        notes: ['le encantó', 'quería repetirlo', 'estaba cansada'],
      },
      [li]: { days: ['Wed', 'Sat', 'Sun'], anchors: ['after-nap'], pool: [ballRoll, bubbles, pictureTalk, songPoint], notes: ['她很喜欢', '笑得很开心'] },
    };
    let n = 0;
    for (let offset = -13; offset <= 1; offset++) {
      const date = addDays(today, offset);
      for (const [caregiverId, p] of Object.entries(plan)) {
        if (!p.days.includes(weekday(date))) continue;
        for (const [k, anchor] of p.anchors.entries()) {
          n += 1;
          let status: AssignmentStatus = 'done';
          let reaction: Reaction | null = null;
          let note: string | null = null;
          if (offset > 0) status = 'planned';
          else if (offset === 0) status = k === 0 ? 'done' : 'planned';
          else if (offset <= -7 ? n % 3 === 0 : n % 6 === 0) status = 'skipped';
          if (status === 'done') {
            reaction = n % 3 === 1 || offset === 0 ? 'loved' : 'ok';
            if (n % 4 === 1 || offset === 0) note = p.notes[offset === 0 ? 0 : n % p.notes.length];
          }
          if (status === 'skipped' && n % 2 === 0) reaction = 'not-today';
          const hour = ROUTINE_ANCHORS.findIndex((a) => a.id === anchor) * 2 + 8;
          await db.query(
            `INSERT INTO assignments (parent_id, caregiver_id, activity_id, date, anchor, status, reaction, caregiver_note, sent_at, reported_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${past(9)}, ${past(10)}, ${past(11)})`,
            [
              parent, caregiverId, p.pool[(offset + 13 + k * 3) % p.pool.length], date, anchor, status, reaction, note,
              offset <= 0 ? at(date, 7, 30) : null,
              ['done', 'skipped'].includes(status) ? at(date, hour + 1) : null,
              at(addDays(date, -1), 20),
            ]
          );
        }
      }
      if (offset <= 0) {
        await db.query('INSERT INTO day_logs (parent_id, date, nap, illness, notes) VALUES ($1, $2, $3, $4, $5)', [
          parent, date, offset !== -9, offset === -4, offset === -4 ? 'Runny nose, kept the day calm.' : '',
        ]);
      }
    }

    // A little chat history and two things waiting for the parent.
    const msg = (caregiverId: string, direction: 'in' | 'out', body: string, when: string, status: 'read' | 'sent' = 'read') =>
      db.query(
        `INSERT INTO messages (parent_id, caregiver_id, direction, kind, body, status, created_at)
         VALUES ($1, $2, $3, 'chat', $4, $5, ${past(6)})`,
        [parent, caregiverId, direction, body, status, when]
      );
    const tylenol = '¿Le puedo dar Tylenol? Está un poco caliente.';
    const spoon = '¿Podemos practicar con la cuchara? La agarra en cada comida.';
    await msg(rosa, 'out', 'Welcome to TARA, Rosa! Thank you for everything you do with Mia.', at(addDays(today, -14), 18));
    await msg(rosa, 'in', '¡Gracias! Con gusto.', at(addDays(today, -14), 18, 20));
    await msg(rosa, 'in', spoon, at(addDays(today, -1), 13, 15));
    await msg(rosa, 'in', tylenol, at(today, 11, 5), 'sent');
    await msg(li, 'out', 'Thanks for Saturdays, Dad! The ball game is her favorite.', at(addDays(today, -2), 20), 'sent');
    await db.query(
      `INSERT INTO alerts (parent_id, caregiver_id, kind, text, date, created_at) VALUES
       ($1, $2, 'parent-question', $3, $4, ${past(5)}), ($1, $2, 'goal-idea', $6, $7, ${past(8)})`,
      [parent, rosa, `Rosa asks: “${tylenol}”`, today, at(today, 11, 5), `Rosa suggests: “${spoon}”`, addDays(today, -1), at(addDays(today, -1), 13, 15)]
    );
  });
  console.log(`Seeded the demo family.
  Parent:     ${EMAIL} / ${PASSWORD}
  Caregivers: ${CAREGIVER_EMAILS.join(', ')} / ${PASSWORD}
  Tita Joy's invite code: ${joyCode}`);
}

seed()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
