import { execute, query } from '@/db';
import { hashAccessCode, validateAccessCode, verifyAccessCode } from './access-code';
import { availability, eventPhase, isValidEmail, normalizeEmail, type AvailabilityState, type EventPhase, type SignupStatus } from './domain';
import { EVENT, LOCATIONS, SHIFTS, TASKS, type ShiftSeed } from './event';
import { normalizeSignupProfile } from './signup-profile';

export type ShiftView = ShiftSeed & { location: (typeof LOCATIONS)[number]; task: (typeof TASKS)[number]; filled: number; remaining: number; state: AvailabilityState };
export type PublicSnapshot = { event: typeof EVENT; essentials: string[]; phase: EventPhase; shifts: ShiftView[] };
export type VolunteerShift = ShiftView & { signupId: string; status: SignupStatus };
export type VolunteerDashboard = { volunteer: { id: string; email: string; firstName: string; lastName: string; phone: string; wantsSiteLead: boolean }; trainings: { general: boolean; lead: boolean }; shifts: VolunteerShift[] };
export type AdminVolunteer = VolunteerDashboard['volunteer'] & { shiftCount: number; trainings: { general: boolean; lead: boolean } };
export type AdminSignup = { id: string; status: SignupStatus; volunteerId: string; volunteerName: string; email: string; phone: string; shiftId: string; locationName: string; taskName: string; startsAt: string };
export type AdminSnapshot = { phase: EventPhase; volunteers: AdminVolunteer[]; signups: AdminSignup[]; shifts: ShiftView[] };

type VolunteerRow = { id: string; email: string; first_name: string; last_name: string; phone: string; wants_site_lead: boolean; access_code_hash: string };
type ShiftRow = { id: string; day: string; location_id: string; task_id: string; starts_at: string; ends_at: string; capacity: number; title: string | null; description: string | null; location_name: string; location_short_name: string; location_blurb: string; walking_note: string; task_name: string; task_description: string; training: 'general' | 'lead'; filled: number };

const SEED_VERSION = 'sccnh-2027-v3';
const SHIFT_SELECT = `SELECT s.id, s.day, s.location_id, s.task_id, s.starts_at, s.ends_at, s.capacity, s.title, s.description,
  l.name AS location_name, l.short_name AS location_short_name, l.blurb AS location_blurb, l.walking_note,
  t.name AS task_name, t.description AS task_description, t.training,
  COALESCE(SUM(CASE WHEN sg.status IN ('confirmed', 'checked_in') THEN 1 ELSE 0 END), 0) AS filled
  FROM shifts s JOIN locations l ON l.id = s.location_id JOIN tasks t ON t.id = s.task_id LEFT JOIN signups sg ON sg.shift_id = s.id`;

function nowIso(): string { return new Date().toISOString(); }

async function ensureReferenceData(): Promise<void> {
  if ((await query<{ version: string }>('SELECT version FROM seed_versions WHERE version = ? LIMIT 1', [SEED_VERSION])).length) return;
  await execute('INSERT INTO events (id, name, tagline, overview, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, tagline = EXCLUDED.tagline, overview = EXCLUDED.overview, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date', [EVENT.id, EVENT.name, EVENT.tagline, EVENT.overview, EVENT.startDate, EVENT.endDate]);
  for (const location of LOCATIONS) await execute('INSERT INTO locations (id, name, short_name, blurb, walking_note) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, short_name = EXCLUDED.short_name, blurb = EXCLUDED.blurb, walking_note = EXCLUDED.walking_note', [location.id, location.name, location.shortName, location.blurb, location.walkingNote]);
  for (const task of TASKS) await execute('INSERT INTO tasks (id, name, description, training) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, training = EXCLUDED.training', [task.id, task.name, task.description, task.training]);
  await execute('UPDATE shifts SET is_active = false');
  for (const shift of SHIFTS) await execute('INSERT INTO shifts (id, day, location_id, task_id, starts_at, ends_at, capacity, title, description, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, true) ON CONFLICT (id) DO UPDATE SET day = EXCLUDED.day, location_id = EXCLUDED.location_id, task_id = EXCLUDED.task_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, capacity = EXCLUDED.capacity, title = EXCLUDED.title, description = EXCLUDED.description, is_active = true', [shift.id, shift.day, shift.locationId, shift.taskId, shift.startsAt, shift.endsAt, shift.capacity, shift.title ?? null, shift.description ?? null]);
  await execute('INSERT INTO seed_versions (version, applied_at) VALUES (?, ?) ON CONFLICT (version) DO NOTHING', [SEED_VERSION, nowIso()]);
}

function mapShift(row: ShiftRow): ShiftView {
  const computed = availability(Number(row.capacity), Array.from({ length: Number(row.filled) }, () => 'confirmed'));
  return { id: row.id, day: row.day, locationId: row.location_id, taskId: row.task_id, startsAt: row.starts_at, endsAt: row.ends_at, capacity: Number(row.capacity), title: row.title ?? undefined, description: row.description ?? undefined, location: { id: row.location_id, name: row.location_name, shortName: row.location_short_name, blurb: row.location_blurb, walkingNote: row.walking_note }, task: { id: row.task_id, name: row.task_name, description: row.task_description, training: row.training }, filled: computed.filled, remaining: computed.remaining, state: computed.state };
}

async function listShiftViews(): Promise<ShiftView[]> {
  await ensureReferenceData();
  return (await query<ShiftRow>(`${SHIFT_SELECT} WHERE s.is_active = true GROUP BY s.id, l.id, t.id ORDER BY s.starts_at, l.name, s.title`)).map(mapShift);
}

export async function getPublicSnapshot(): Promise<PublicSnapshot> { return { event: EVENT, essentials: EVENT.essentials, phase: eventPhase(), shifts: await listShiftViews() }; }

async function dashboardFor(volunteer: VolunteerRow): Promise<VolunteerDashboard> {
  const [trainingRows, signupRows, signupMeta] = await Promise.all([
    query<{ type: 'general' | 'lead' }>('SELECT type FROM trainings WHERE volunteer_id = ?', [volunteer.id]),
    query<ShiftRow>(`${SHIFT_SELECT} JOIN signups mine ON mine.shift_id = s.id AND mine.volunteer_id = ? WHERE mine.status IN ('confirmed', 'checked_in') GROUP BY s.id, l.id, t.id ORDER BY s.starts_at`, [volunteer.id]),
    query<{ id: string; shift_id: string; status: SignupStatus }>("SELECT id, shift_id, status FROM signups WHERE volunteer_id = ? AND status IN ('confirmed', 'checked_in')", [volunteer.id]),
  ]);
  const meta = new Map(signupMeta.map((row) => [row.shift_id, row]));
  return { volunteer: { id: volunteer.id, email: volunteer.email, firstName: volunteer.first_name, lastName: volunteer.last_name, phone: volunteer.phone, wantsSiteLead: volunteer.wants_site_lead }, trainings: { general: trainingRows.some((row) => row.type === 'general'), lead: trainingRows.some((row) => row.type === 'lead') }, shifts: signupRows.map((row) => ({ ...mapShift(row), signupId: meta.get(row.id)!.id, status: meta.get(row.id)!.status })) };
}

async function volunteerWithAccess(emailInput: string, codeInput: string): Promise<VolunteerRow | null> {
  const email = normalizeEmail(emailInput); const code = validateAccessCode(codeInput);
  if (!isValidEmail(email) || !code) return null;
  const rows = await query<VolunteerRow>('SELECT id, email, first_name, last_name, phone, wants_site_lead, access_code_hash FROM volunteers WHERE email = ? LIMIT 1', [email]);
  if (!rows[0] || !(await verifyAccessCode(code, rows[0].access_code_hash))) return null;
  return rows[0];
}

export async function getVolunteerDashboard(emailInput: string, codeInput: string): Promise<VolunteerDashboard | null> {
  await ensureReferenceData(); const volunteer = await volunteerWithAccess(emailInput, codeInput); return volunteer ? dashboardFor(volunteer) : null;
}

export async function claimShift(input: { shiftId: string; firstName: string; lastName: string; email: string; phone: string; wantsSiteLead: boolean; accessCode: string }): Promise<{ ok: true; dashboard: VolunteerDashboard } | { ok: false; message: string; code: string }> {
  await ensureReferenceData();
  const profile = normalizeSignupProfile(input); const accessCode = validateAccessCode(input.accessCode);
  if (!profile.ok || !accessCode) return { ok: false, code: 'invalid_input', message: !profile.ok ? profile.message : 'Use an access code with at least 12 characters.' };
  const { firstName, lastName, email, phone, wantsSiteLead } = profile.value;
  if (!(await query<{ id: string }>('SELECT id FROM shifts WHERE id = ? LIMIT 1', [input.shiftId])).length) return { ok: false, code: 'not_found', message: 'That shift is unavailable.' };
  const existing = await query<VolunteerRow>('SELECT id, email, first_name, last_name, phone, wants_site_lead, access_code_hash FROM volunteers WHERE email = ? LIMIT 1', [email]);
  let volunteer = existing[0];
  if (!volunteer) {
    const id = crypto.randomUUID();
    await execute('INSERT INTO volunteers (id, email, first_name, last_name, phone, wants_site_lead, access_code_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, email, firstName, lastName, phone, wantsSiteLead, await hashAccessCode(accessCode), nowIso()]);
    volunteer = { id, email, first_name: firstName, last_name: lastName, phone, wants_site_lead: wantsSiteLead, access_code_hash: '' };
  } else if (!(await verifyAccessCode(accessCode, volunteer.access_code_hash))) return { ok: false, code: 'access_denied', message: 'We could not verify this signup.' };
  else {
    await execute("UPDATE volunteers SET phone = CASE WHEN phone = '' THEN ? ELSE phone END, wants_site_lead = wants_site_lead OR ? WHERE id = ?", [phone, wantsSiteLead, volunteer.id]);
    if (!volunteer.phone) volunteer.phone = phone;
    if (wantsSiteLead) volunteer.wants_site_lead = true;
  }
  if ((await query<{ status: SignupStatus }>("SELECT status FROM signups WHERE volunteer_id = ? AND shift_id = ? AND status IN ('confirmed', 'checked_in') LIMIT 1", [volunteer.id, input.shiftId])).length) return { ok: false, code: 'duplicate', message: 'You already have this shift.' };
  const timestamp = nowIso();
  const changed = await execute(`INSERT INTO signups (id, volunteer_id, shift_id, status, created_at, updated_at)
    SELECT ?, ?, s.id, 'confirmed', ?, ? FROM shifts s WHERE s.id = ? AND s.capacity > (SELECT COUNT(*) FROM signups existing WHERE existing.shift_id = s.id AND existing.status IN ('confirmed', 'checked_in'))
    ON CONFLICT (volunteer_id, shift_id) DO UPDATE SET status = 'confirmed', updated_at = EXCLUDED.updated_at WHERE signups.status = 'cancelled'`, [crypto.randomUUID(), volunteer.id, timestamp, timestamp, input.shiftId]);
  if (!changed) return { ok: false, code: 'full', message: 'That shift just filled.' };
  return { ok: true, dashboard: await dashboardFor(volunteer) };
}

export async function cancelSignup(signupId: string, emailInput: string, codeInput: string): Promise<{ ok: boolean; message: string }> {
  await ensureReferenceData(); const volunteer = await volunteerWithAccess(emailInput, codeInput);
  if (!volunteer) return { ok: false, message: 'That shift could not be found.' };
  return (await execute("UPDATE signups SET status = 'cancelled', updated_at = ? WHERE id = ? AND volunteer_id = ? AND status IN ('confirmed', 'checked_in')", [nowIso(), signupId, volunteer.id])) ? { ok: true, message: 'Shift cancelled.' } : { ok: false, message: 'That shift could not be found.' };
}

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  await ensureReferenceData();
  const [volunteers, signups, shifts] = await Promise.all([
    query<{ id: string; email: string; first_name: string; last_name: string; phone: string; wants_site_lead: boolean; shift_count: number; general: number; lead: number }>("SELECT v.id, v.email, v.first_name, v.last_name, v.phone, v.wants_site_lead, COUNT(DISTINCT CASE WHEN sg.status IN ('confirmed', 'checked_in') THEN sg.id END) AS shift_count, MAX(CASE WHEN tr.type = 'general' THEN 1 ELSE 0 END) AS general, MAX(CASE WHEN tr.type = 'lead' THEN 1 ELSE 0 END) AS lead FROM volunteers v LEFT JOIN signups sg ON sg.volunteer_id = v.id LEFT JOIN trainings tr ON tr.volunteer_id = v.id GROUP BY v.id ORDER BY v.last_name, v.first_name"),
    query<{ id: string; status: SignupStatus; volunteer_id: string; volunteer_name: string; email: string; phone: string; shift_id: string; location_name: string; task_name: string; starts_at: string }>("SELECT sg.id, sg.status, v.id AS volunteer_id, v.first_name || ' ' || v.last_name AS volunteer_name, v.email, v.phone, s.id AS shift_id, l.name AS location_name, t.name AS task_name, s.starts_at FROM signups sg JOIN volunteers v ON v.id = sg.volunteer_id JOIN shifts s ON s.id = sg.shift_id JOIN locations l ON l.id = s.location_id JOIN tasks t ON t.id = s.task_id WHERE sg.status IN ('confirmed', 'checked_in') ORDER BY s.starts_at, v.last_name, v.first_name"),
    listShiftViews(),
  ]);
  return { phase: eventPhase(), volunteers: volunteers.map((row) => ({ id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name, phone: row.phone, wantsSiteLead: row.wants_site_lead, shiftCount: Number(row.shift_count), trainings: { general: Boolean(row.general), lead: Boolean(row.lead) } })), signups: signups.map((row) => ({ id: row.id, status: row.status, volunteerId: row.volunteer_id, volunteerName: row.volunteer_name, email: row.email, phone: row.phone, shiftId: row.shift_id, locationName: row.location_name, taskName: row.task_name, startsAt: row.starts_at })), shifts };
}

export async function setTraining(input: { volunteerId: string; type: 'general' | 'lead'; complete: boolean; completedBy: string }): Promise<{ ok: boolean; message: string }> {
  await ensureReferenceData();
  if (input.complete) await execute('INSERT INTO trainings (id, volunteer_id, type, completed_at, completed_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT (volunteer_id, type) DO UPDATE SET completed_at = EXCLUDED.completed_at, completed_by = EXCLUDED.completed_by', [crypto.randomUUID(), input.volunteerId, input.type, nowIso(), input.completedBy]);
  else await execute('DELETE FROM trainings WHERE volunteer_id = ? AND type = ?', [input.volunteerId, input.type]);
  return { ok: true, message: input.complete ? 'Training marked complete.' : 'Training mark removed.' };
}

export async function updateCapacity(shiftId: string, capacity: number): Promise<{ ok: boolean; message: string }> {
  await ensureReferenceData(); const next = Math.trunc(capacity);
  if (!Number.isFinite(next) || next < 0 || next > 500) return { ok: false, message: 'Capacity must be between 0 and 500.' };
  const filled = await query<{ count: number }>("SELECT COUNT(*) AS count FROM signups WHERE shift_id = ? AND status IN ('confirmed', 'checked_in')", [shiftId]);
  if (next < Number(filled[0]?.count ?? 0)) return { ok: false, message: 'Capacity cannot be below current signups.' };
  return (await execute('UPDATE shifts SET capacity = ? WHERE id = ?', [next, shiftId])) ? { ok: true, message: 'Capacity updated.' } : { ok: false, message: 'Shift not found.' };
}

export async function setCheckedIn(signupId: string, checkedIn: boolean): Promise<{ ok: boolean; message: string }> {
  await ensureReferenceData(); if (eventPhase() !== 'during') return { ok: false, message: 'Check-in opens on January 25.' };
  return (await execute("UPDATE signups SET status = ?, updated_at = ? WHERE id = ? AND status IN ('confirmed', 'checked_in')", [checkedIn ? 'checked_in' : 'confirmed', nowIso(), signupId])) ? { ok: true, message: checkedIn ? 'Volunteer checked in.' : 'Check-in removed.' } : { ok: false, message: 'Signup not found.' };
}
