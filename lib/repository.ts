import { getD1 } from '@/db';
import {
  availability,
  eventPhase,
  isValidEmail,
  normalizeEmail,
  type AvailabilityState,
  type EventPhase,
  type SignupStatus,
} from './domain';
import { EVENT, LOCATIONS, SHIFTS, TASKS, type ShiftSeed } from './event';

export type ShiftView = ShiftSeed & {
  location: (typeof LOCATIONS)[number];
  task: (typeof TASKS)[number];
  filled: number;
  remaining: number;
  state: AvailabilityState;
};

export type PublicSnapshot = {
  event: typeof EVENT;
  essentials: string[];
  phase: EventPhase;
  shifts: ShiftView[];
};

export type VolunteerShift = ShiftView & {
  signupId: string;
  status: SignupStatus;
};

export type VolunteerDashboard = {
  volunteer: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  trainings: { general: boolean; lead: boolean };
  shifts: VolunteerShift[];
};

export type AdminVolunteer = VolunteerDashboard['volunteer'] & {
  shiftCount: number;
  trainings: { general: boolean; lead: boolean };
};

export type AdminSignup = {
  id: string;
  status: SignupStatus;
  volunteerId: string;
  volunteerName: string;
  email: string;
  phone: string;
  shiftId: string;
  locationName: string;
  taskName: string;
  startsAt: string;
};

export type AdminSnapshot = {
  phase: EventPhase;
  volunteers: AdminVolunteer[];
  signups: AdminSignup[];
  shifts: ShiftView[];
};

const SEED_VERSION = 'sccnh-2027-v1';

function nowIso(): string {
  return new Date().toISOString();
}

async function ensureReferenceData(): Promise<void> {
  const db = getD1();
  const existing = await db
    .prepare('SELECT version FROM seed_versions WHERE version = ? LIMIT 1')
    .bind(SEED_VERSION)
    .first();
  if (existing) return;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        'INSERT OR IGNORE INTO events (id, name, tagline, overview, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(EVENT.id, EVENT.name, EVENT.tagline, EVENT.overview, EVENT.startDate, EVENT.endDate),
    ...LOCATIONS.map((location) =>
      db
        .prepare(
          'INSERT OR IGNORE INTO locations (id, name, short_name, blurb, walking_note) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(location.id, location.name, location.shortName, location.blurb, location.walkingNote),
    ),
    ...TASKS.map((task) =>
      db
        .prepare(
          'INSERT OR IGNORE INTO tasks (id, name, description, training) VALUES (?, ?, ?, ?)',
        )
        .bind(task.id, task.name, task.description, task.training),
    ),
    ...SHIFTS.map((shift) =>
      db
        .prepare(
          'INSERT OR IGNORE INTO shifts (id, day, location_id, task_id, starts_at, ends_at, capacity, title, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          shift.id,
          shift.day,
          shift.locationId,
          shift.taskId,
          shift.startsAt,
          shift.endsAt,
          shift.capacity,
          shift.title ?? null,
          shift.description ?? null,
        ),
    ),
    db
      .prepare('INSERT OR IGNORE INTO seed_versions (version, applied_at) VALUES (?, ?)')
      .bind(SEED_VERSION, nowIso()),
  ];
  await db.batch(statements);
}

type ShiftRow = {
  id: string;
  day: string;
  location_id: string;
  task_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  title: string | null;
  description: string | null;
  location_name: string;
  location_short_name: string;
  location_blurb: string;
  walking_note: string;
  task_name: string;
  task_description: string;
  training: 'general' | 'lead';
  filled: number;
};

const SHIFT_SELECT = `
  SELECT
    s.id, s.day, s.location_id, s.task_id, s.starts_at, s.ends_at,
    s.capacity, s.title, s.description,
    l.name AS location_name, l.short_name AS location_short_name,
    l.blurb AS location_blurb, l.walking_note,
    t.name AS task_name, t.description AS task_description, t.training,
    COALESCE(SUM(CASE WHEN sg.status IN ('confirmed', 'checked_in') THEN 1 ELSE 0 END), 0) AS filled
  FROM shifts s
  JOIN locations l ON l.id = s.location_id
  JOIN tasks t ON t.id = s.task_id
  LEFT JOIN signups sg ON sg.shift_id = s.id
`;

function mapShift(row: ShiftRow): ShiftView {
  const filled = Number(row.filled);
  const computed = availability(Number(row.capacity), Array.from({ length: filled }, () => 'confirmed'));
  return {
    id: row.id,
    day: row.day,
    locationId: row.location_id,
    taskId: row.task_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: Number(row.capacity),
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    location: {
      id: row.location_id,
      name: row.location_name,
      shortName: row.location_short_name,
      blurb: row.location_blurb,
      walkingNote: row.walking_note,
    },
    task: {
      id: row.task_id,
      name: row.task_name,
      description: row.task_description,
      training: row.training,
    },
    filled: computed.filled,
    remaining: computed.remaining,
    state: computed.state,
  };
}

async function listShiftViews(): Promise<ShiftView[]> {
  await ensureReferenceData();
  const result = await getD1()
    .prepare(`${SHIFT_SELECT} GROUP BY s.id ORDER BY s.starts_at, l.name, s.title`)
    .all<ShiftRow>();
  return result.results.map(mapShift);
}

export async function getPublicSnapshot(): Promise<PublicSnapshot> {
  return {
    event: EVENT,
    essentials: EVENT.essentials,
    phase: eventPhase(),
    shifts: await listShiftViews(),
  };
}

export async function getVolunteerDashboard(emailInput: string): Promise<VolunteerDashboard | null> {
  await ensureReferenceData();
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email)) return null;
  const db = getD1();
  const volunteer = await db
    .prepare('SELECT id, email, first_name, last_name, phone FROM volunteers WHERE email = ? LIMIT 1')
    .bind(email)
    .first<{ id: string; email: string; first_name: string; last_name: string; phone: string }>();
  if (!volunteer) return null;

  const [trainingRows, signupRows] = await Promise.all([
    db
      .prepare('SELECT type FROM trainings WHERE volunteer_id = ?')
      .bind(volunteer.id)
      .all<{ type: 'general' | 'lead' }>(),
    db
      .prepare(
        `${SHIFT_SELECT}
         JOIN signups mine ON mine.shift_id = s.id AND mine.volunteer_id = ?
         WHERE mine.status IN ('confirmed', 'checked_in')
         GROUP BY s.id
         ORDER BY s.starts_at`,
      )
      .bind(volunteer.id)
      .all<ShiftRow & { signup_id?: string; signup_status?: SignupStatus }>(),
  ]);

  const signupMeta = await db
    .prepare(
      `SELECT id, shift_id, status FROM signups
       WHERE volunteer_id = ? AND status IN ('confirmed', 'checked_in')`,
    )
    .bind(volunteer.id)
    .all<{ id: string; shift_id: string; status: SignupStatus }>();
  const meta = new Map(signupMeta.results.map((row) => [row.shift_id, row]));

  return {
    volunteer: {
      id: volunteer.id,
      email: volunteer.email,
      firstName: volunteer.first_name,
      lastName: volunteer.last_name,
      phone: volunteer.phone,
    },
    trainings: {
      general: trainingRows.results.some((row) => row.type === 'general'),
      lead: trainingRows.results.some((row) => row.type === 'lead'),
    },
    shifts: signupRows.results.map((row) => {
      const signup = meta.get(row.id)!;
      return { ...mapShift(row), signupId: signup.id, status: signup.status };
    }),
  };
}

export async function claimShift(input: {
  shiftId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}): Promise<{ ok: true; dashboard: VolunteerDashboard } | { ok: false; message: string; code: string }> {
  await ensureReferenceData();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = normalizeEmail(input.email);
  const phone = input.phone?.trim() ?? '';
  if (!firstName || !lastName || !isValidEmail(email)) {
    return { ok: false, code: 'invalid_input', message: 'Enter your first name, last name, and a working email address.' };
  }

  const db = getD1();
  const shift = await db
    .prepare(
      `SELECT s.capacity,
        (SELECT COUNT(*) FROM signups sg WHERE sg.shift_id = s.id AND sg.status IN ('confirmed', 'checked_in')) AS filled
       FROM shifts s WHERE s.id = ?`,
    )
    .bind(input.shiftId)
    .first<{ capacity: number; filled: number }>();
  if (!shift) return { ok: false, code: 'not_found', message: 'That shift is no longer available.' };

  let volunteer = await db
    .prepare('SELECT id FROM volunteers WHERE email = ? LIMIT 1')
    .bind(email)
    .first<{ id: string }>();
  if (!volunteer) {
    const volunteerId = crypto.randomUUID();
    await db
      .prepare(
        'INSERT OR IGNORE INTO volunteers (id, email, first_name, last_name, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(volunteerId, email, firstName, lastName, phone, nowIso())
      .run();
    volunteer = await db
      .prepare('SELECT id FROM volunteers WHERE email = ? LIMIT 1')
      .bind(email)
      .first<{ id: string }>();
  } else if (phone) {
    await db
      .prepare("UPDATE volunteers SET phone = CASE WHEN phone = '' THEN ? ELSE phone END WHERE id = ?")
      .bind(phone, volunteer.id)
      .run();
  }
  if (!volunteer) return { ok: false, code: 'unavailable', message: 'We could not save your contact information. Try again.' };

  const duplicate = await db
    .prepare(
      `SELECT status FROM signups WHERE volunteer_id = ? AND shift_id = ? AND status IN ('confirmed', 'checked_in') LIMIT 1`,
    )
    .bind(volunteer.id, input.shiftId)
    .first();
  if (duplicate) return { ok: false, code: 'duplicate', message: 'You already have this shift. It is listed under My shifts.' };

  const timestamp = nowIso();
  const result = await db
    .prepare(
      `INSERT INTO signups (id, volunteer_id, shift_id, status, created_at, updated_at)
       SELECT ?, ?, s.id, 'confirmed', ?, ? FROM shifts s
       WHERE s.id = ?
         AND s.capacity > (
           SELECT COUNT(*) FROM signups existing
           WHERE existing.shift_id = s.id AND existing.status IN ('confirmed', 'checked_in')
         )
       ON CONFLICT(volunteer_id, shift_id) DO UPDATE SET
         status = 'confirmed', updated_at = excluded.updated_at
       WHERE signups.status = 'cancelled'`,
    )
    .bind(crypto.randomUUID(), volunteer.id, timestamp, timestamp, input.shiftId)
    .run();

  if (!result.meta.changes) {
    return { ok: false, code: 'full', message: 'That shift just filled. Choose one of the nearby open options.' };
  }
  const dashboard = await getVolunteerDashboard(email);
  if (!dashboard) return { ok: false, code: 'unavailable', message: 'Your shift was saved, but the confirmation view is unavailable.' };
  return { ok: true, dashboard };
}

export async function cancelSignup(signupId: string, emailInput: string): Promise<{ ok: boolean; message: string }> {
  await ensureReferenceData();
  const result = await getD1()
    .prepare(
      `UPDATE signups SET status = 'cancelled', updated_at = ?
       WHERE id = ? AND volunteer_id = (SELECT id FROM volunteers WHERE email = ?)
         AND status IN ('confirmed', 'checked_in')`,
    )
    .bind(nowIso(), signupId, normalizeEmail(emailInput))
    .run();
  return result.meta.changes
    ? { ok: true, message: 'Shift cancelled. The spot is open for someone else.' }
    : { ok: false, message: 'That active signup could not be found.' };
}

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  await ensureReferenceData();
  const db = getD1();
  const [volunteerRows, signupRows, shifts] = await Promise.all([
    db
      .prepare(
        `SELECT v.id, v.email, v.first_name, v.last_name, v.phone,
          COUNT(DISTINCT CASE WHEN sg.status IN ('confirmed', 'checked_in') THEN sg.id END) AS shift_count,
          MAX(CASE WHEN tr.type = 'general' THEN 1 ELSE 0 END) AS general,
          MAX(CASE WHEN tr.type = 'lead' THEN 1 ELSE 0 END) AS lead
         FROM volunteers v
         LEFT JOIN signups sg ON sg.volunteer_id = v.id
         LEFT JOIN trainings tr ON tr.volunteer_id = v.id
         GROUP BY v.id ORDER BY v.last_name, v.first_name`,
      )
      .all<{
        id: string; email: string; first_name: string; last_name: string; phone: string;
        shift_count: number; general: number; lead: number;
      }>(),
    db
      .prepare(
        `SELECT sg.id, sg.status, v.id AS volunteer_id,
          v.first_name || ' ' || v.last_name AS volunteer_name, v.email, v.phone,
          s.id AS shift_id, l.name AS location_name, t.name AS task_name, s.starts_at
         FROM signups sg
         JOIN volunteers v ON v.id = sg.volunteer_id
         JOIN shifts s ON s.id = sg.shift_id
         JOIN locations l ON l.id = s.location_id
         JOIN tasks t ON t.id = s.task_id
         WHERE sg.status IN ('confirmed', 'checked_in')
         ORDER BY s.starts_at, v.last_name, v.first_name`,
      )
      .all<{
        id: string; status: SignupStatus; volunteer_id: string; volunteer_name: string;
        email: string; phone: string; shift_id: string; location_name: string; task_name: string; starts_at: string;
      }>(),
    listShiftViews(),
  ]);

  return {
    phase: eventPhase(),
    volunteers: volunteerRows.results.map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      shiftCount: Number(row.shift_count),
      trainings: { general: Boolean(row.general), lead: Boolean(row.lead) },
    })),
    signups: signupRows.results.map((row) => ({
      id: row.id,
      status: row.status,
      volunteerId: row.volunteer_id,
      volunteerName: row.volunteer_name,
      email: row.email,
      phone: row.phone,
      shiftId: row.shift_id,
      locationName: row.location_name,
      taskName: row.task_name,
      startsAt: row.starts_at,
    })),
    shifts,
  };
}

export async function setTraining(input: {
  volunteerId: string;
  type: 'general' | 'lead';
  complete: boolean;
  completedBy: string;
}): Promise<{ ok: boolean; message: string }> {
  await ensureReferenceData();
  const db = getD1();
  if (input.complete) {
    await db
      .prepare(
        `INSERT INTO trainings (id, volunteer_id, type, completed_at, completed_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(volunteer_id, type) DO UPDATE SET completed_at = excluded.completed_at, completed_by = excluded.completed_by`,
      )
      .bind(crypto.randomUUID(), input.volunteerId, input.type, nowIso(), input.completedBy)
      .run();
  } else {
    await db
      .prepare('DELETE FROM trainings WHERE volunteer_id = ? AND type = ?')
      .bind(input.volunteerId, input.type)
      .run();
  }
  return { ok: true, message: input.complete ? 'Training marked complete.' : 'Training mark removed.' };
}

export async function updateCapacity(shiftId: string, capacity: number): Promise<{ ok: boolean; message: string }> {
  await ensureReferenceData();
  const next = Math.trunc(capacity);
  if (!Number.isFinite(next) || next < 0 || next > 500) return { ok: false, message: 'Capacity must be between 0 and 500.' };
  const db = getD1();
  const filled = await db
    .prepare("SELECT COUNT(*) AS count FROM signups WHERE shift_id = ? AND status IN ('confirmed', 'checked_in')")
    .bind(shiftId)
    .first<{ count: number }>();
  if (next < Number(filled?.count ?? 0)) return { ok: false, message: 'Capacity cannot be lower than the number already signed up.' };
  const result = await db.prepare('UPDATE shifts SET capacity = ? WHERE id = ?').bind(next, shiftId).run();
  return result.meta.changes
    ? { ok: true, message: 'Capacity updated.' }
    : { ok: false, message: 'Shift not found.' };
}

export async function setCheckedIn(signupId: string, checkedIn: boolean): Promise<{ ok: boolean; message: string }> {
  await ensureReferenceData();
  if (eventPhase() !== 'during') return { ok: false, message: 'Check-in opens on the first event day.' };
  const result = await getD1()
    .prepare("UPDATE signups SET status = ?, updated_at = ? WHERE id = ? AND status IN ('confirmed', 'checked_in')")
    .bind(checkedIn ? 'checked_in' : 'confirmed', nowIso(), signupId)
    .run();
  return result.meta.changes
    ? { ok: true, message: checkedIn ? 'Volunteer checked in.' : 'Check-in removed.' }
    : { ok: false, message: 'Signup not found.' };
}
