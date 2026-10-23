import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import postgres from 'postgres';
import { browserManagementKey, newBrowserToken } from '../lib/browser-signup.ts';
import { LOCATIONS, TASKS } from '../lib/event.ts';

const url = process.env.TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Browser signup tests require a disposable local TEST_DATABASE_URL.');
process.env.DATABASE_URL = url;
const { getDatabase } = await import('../db/index.ts');
const { claimBrowserShifts, getBrowserDashboard, getPublicSnapshot, cancelBrowserSignup, changeBrowserSignup, getAdminSnapshot } = await import('../lib/repository.ts');
const { authenticateAccount, accountForSession, revokeAccountSession } = await import('../lib/account-repository.ts');
const sql = postgres(url, { max: 5, prepare: false });
const prefix = `browser-${randomUUID()}`;
const key = () => browserManagementKey(newBrowserToken());
const profile = (index: number, shiftIds: string[]) => ({ firstName: 'Browser', lastName: `Test${index}`, email: `${prefix}-${index}@example.test`, phone: '3525550100', wantsSiteLead: true, consent: true, shiftIds });
async function slot(suffix: string, capacity = 3, hour = 8) {
  const id = `${prefix}-${suffix}`;
  await sql`INSERT INTO shifts (id, day, location_id, task_id, starts_at, ends_at, capacity, is_active) VALUES (${id}, '2027-01-28', ${LOCATIONS[0].id}, ${TASKS[0].id}, ${`2027-01-28T${String(hour).padStart(2, '0')}:00:00-05:00`}, ${`2027-01-28T${String(hour + 1).padStart(2, '0')}:00:00-05:00`}, ${capacity}, true)`;
  return id;
}

before(async () => { await getPublicSnapshot(); });
after(async () => {
  await sql`DELETE FROM trainings WHERE volunteer_id IN (SELECT id FROM volunteers WHERE email LIKE ${`${prefix}%`})`;
  await sql`DELETE FROM signups WHERE shift_id LIKE ${`${prefix}%`} OR volunteer_id IN (SELECT id FROM volunteers WHERE email LIKE ${`${prefix}%`})`;
  await sql`DELETE FROM volunteers WHERE email LIKE ${`${prefix}%`}`;
  await sql`DELETE FROM volunteer_accounts WHERE email LIKE ${`${prefix}%`}`;
  await sql`DELETE FROM shifts WHERE id LIKE ${`${prefix}%`}`;
  await sql.end();
  await getDatabase().end();
});

void test('password-free batch is private to its browser and records consent', async () => {
  const first = await slot('private-first');
  const second = await slot('private-second', 3, 9);
  const owner = key();
  assert.equal((await claimBrowserShifts(profile(1, [first, second]), owner)).ok, true);
  const dashboard = await getBrowserDashboard(owner);
  assert.equal(dashboard.shifts.length, 2);
  assert.deepEqual(await getBrowserDashboard(key()), { shifts: [] });
  assert.equal(JSON.stringify(dashboard).includes('@example.test'), false);
  const [record] = await sql`SELECT registration, management_key FROM signups WHERE id = ${dashboard.shifts[0].signupId}`;
  assert.equal(record.registration.consentVersion, 'sccnh-volunteer-v1');
  assert.ok(record.registration.consentedAt);
  assert.equal(record.management_key, owner);
  assert.equal(await cancelBrowserSignup(dashboard.shifts[0].signupId, key()), false);
  assert.equal(await cancelBrowserSignup(dashboard.shifts[0].signupId, owner), true);
});

void test('another browser using the same email cannot inherit prior bookings or overwrite contact data', async () => {
  const first = await slot('identity-first');
  const second = await slot('identity-second', 3, 10);
  const owner = key(); const stranger = key();
  assert.equal((await claimBrowserShifts(profile(2, [first]), owner)).ok, true);
  assert.equal((await claimBrowserShifts({ ...profile(2, [second]), firstName: 'Different', phone: '3525550199' }, stranger)).ok, true);
  const strangerDashboard = await getBrowserDashboard(stranger);
  assert.deepEqual(strangerDashboard.shifts.map((shift) => shift.id), [second]);
  assert.deepEqual((await getBrowserDashboard(owner)).shifts.map((shift) => shift.id), [first]);
  const [volunteer] = await sql`SELECT first_name, phone FROM volunteers WHERE email = ${profile(2, []).email} AND browser_key = ${owner}`;
  assert.equal(volunteer.first_name, 'Browser');
  assert.equal(volunteer.phone, '3525550100');
  const roster = await getAdminSnapshot();
  assert.equal(roster.signups.find((signup) => signup.shiftId === second)?.volunteerName, 'Different Test2');
  assert.equal(roster.signups.find((signup) => signup.shiftId === second)?.phone, '3525550199');
});

void test('signup cannot enumerate another browser registration by submitting the same email and shift', async () => {
  const first = await slot('enumeration', 5);
  const owner = key(); const stranger = key();
  const input = profile(6, [first]);
  assert.equal((await claimBrowserShifts(input, owner)).ok, true);
  assert.equal((await claimBrowserShifts(input, stranger)).ok, true);
  const original = await getBrowserDashboard(owner);
  const duplicate = await getBrowserDashboard(stranger);
  assert.equal(original.shifts.length, 1);
  assert.equal(duplicate.shifts.length, 1);
  assert.notEqual(original.shifts[0].signupId, duplicate.shifts[0].signupId);
  assert.equal(await cancelBrowserSignup(original.shifts[0].signupId, stranger), false);
});

void test('if any selected shift is full, the entire batch leaves no signup or volunteer', async () => {
  const open = await slot('atomic-open');
  const full = await slot('atomic-full', 0, 10);
  assert.equal((await claimBrowserShifts(profile(3, [open, full]), key())).ok, false);
  const [count] = await sql`SELECT COUNT(*)::int AS count FROM signups WHERE shift_id = ${open}`;
  assert.equal(count.count, 0);
  const volunteers = await sql`SELECT id FROM volunteers WHERE email = ${profile(3, []).email}`;
  assert.equal(volunteers.length, 0);
});

void test('concurrent batches respect the smallest available capacity', async () => {
  const first = await slot('race-first', 3);
  const second = await slot('race-second', 2, 10);
  const results = await Promise.all(Array.from({ length: 12 }, (_, index) => claimBrowserShifts(profile(100 + index, index % 2 ? [first, second] : [second, first]), key())));
  assert.equal(results.filter((result) => result.ok).length, 2);
  const rows = await sql`SELECT shift_id, COUNT(*)::int AS count FROM signups WHERE shift_id IN (${first}, ${second}) GROUP BY shift_id`;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.count === 2));
});

void test('no consent, overlapping selection and duplicate retries do not create extra bookings', async () => {
  const first = await slot('validation-first');
  const overlap = await slot('validation-overlap');
  const owner = key();
  assert.equal((await claimBrowserShifts({ ...profile(4, [first]), consent: false }, owner)).ok, false);
  assert.equal((await claimBrowserShifts(profile(4, [first, overlap]), owner)).ok, false);
  assert.equal((await claimBrowserShifts(profile(4, [first]), owner)).ok, true);
  assert.equal((await claimBrowserShifts(profile(4, [first]), owner)).ok, false);
  assert.equal((await getBrowserDashboard(owner)).shifts.length, 1);
});

void test('full replacements preserve the source and expired or forged capabilities cannot change it', async () => {
  const first = await slot('change-first');
  const full = await slot('change-full', 0, 10);
  const target = await slot('change-open', 3, 11);
  const owner = key();
  assert.equal((await claimBrowserShifts(profile(5, [first]), owner)).ok, true);
  const source = (await getBrowserDashboard(owner)).shifts[0];
  assert.equal((await changeBrowserSignup(source.signupId, target, key())).ok, false);
  assert.equal((await changeBrowserSignup(source.signupId, full, owner)).ok, false);
  assert.equal((await getBrowserDashboard(owner)).shifts[0].id, first);
  assert.equal((await changeBrowserSignup(source.signupId, target, owner)).ok, true);
  assert.equal((await getBrowserDashboard(owner)).shifts[0].id, target);
  await sql`UPDATE signups SET management_expires_at = 0 WHERE id = ${source.signupId}`;
  assert.deepEqual(await getBrowserDashboard(owner), { shifts: [] });
  assert.equal(await cancelBrowserSignup(source.signupId, owner), false);
});

void test('date correction moves existing bookings in place without resetting organizer capacity', async () => {
  const shiftId = 'turlington-20270127-0800';
  const owner = key();
  assert.equal((await claimBrowserShifts(profile(30, [shiftId]), owner)).ok, true);
  const before = (await getBrowserDashboard(owner)).shifts[0];
  try {
    await sql`UPDATE shifts SET day = '2027-01-27', starts_at = '2027-01-27T08:00:00-05:00', ends_at = '2027-01-27T08:30:00-05:00', capacity = 17 WHERE id = ${shiftId}`;
    await sql`DELETE FROM seed_versions WHERE version = 'sccnh-2027-v6-dates'`;
    await getPublicSnapshot();
    const after = (await getBrowserDashboard(owner)).shifts[0];
    assert.equal(after.signupId, before.signupId);
    assert.equal(after.id, before.id);
    assert.equal(after.day, '2027-01-28');
    assert.equal(after.startsAt, '2027-01-28T08:00:00-05:00');
    assert.equal(after.capacity, 17);
  } finally { await sql`UPDATE shifts SET capacity = 15 WHERE id = ${shiftId}`; }
});

void test('email and phone sign-in links matching historical bookings across devices without exposing other contacts', async () => {
  const email = profile(40, []).email;
  const first = await slot('account-first');
  const second = await slot('account-second', 3, 10);
  const unrelated = await slot('account-other-phone', 3, 12);
  await claimBrowserShifts(profile(40, [first]), key());
  await claimBrowserShifts({ ...profile(40, [second]), phone: '+1 (352) 555-0100' }, key());
  await claimBrowserShifts({ ...profile(40, [unrelated]), phone: '3525550199' }, key());
  assert.equal(await authenticateAccount(email, '3525550000'), null);
  const login = await authenticateAccount(email.toUpperCase(), '(352) 555-0100');
  assert.ok(login);
  const secondDevice = await authenticateAccount(email, '+1 352-555-0100');
  assert.ok(secondDevice);
  assert.notEqual(login.token, secondDevice.token);
  assert.deepEqual((await getBrowserDashboard(secondDevice.account.management_key)).shifts.map((shift) => shift.id), [first, second]);
  const [original] = await sql`SELECT volunteer_id FROM signups WHERE shift_id = ${first}`;
  await sql`INSERT INTO trainings (id, volunteer_id, type, completed_at, completed_by) VALUES (${randomUUID()}, ${original.volunteer_id}, 'general', ${new Date().toISOString()}, 'local-test')`;
  const later = await slot('account-retains-record', 3, 14);
  assert.equal((await claimBrowserShifts({ ...profile(40, [later]), wantsSiteLead: false }, login.account.management_key, login.account.id)).ok, true);
  const [saved] = await sql`SELECT volunteer_id, registration FROM signups WHERE shift_id = ${later}`;
  assert.equal(saved.volunteer_id, original.volunteer_id, 'New account bookings retain the existing trained volunteer record');
  assert.equal(saved.registration.wantsSiteLead, true, 'Signup must not clear existing site-lead records');
  assert.equal(await authenticateAccount(email, '3525550199'), null, 'An established identity cannot be replaced using a different phone');
  assert.equal(await authenticateAccount(email, '3525550199', true), null);
  const [stored] = await sql`SELECT phone_hash FROM volunteer_accounts WHERE email = ${email}`;
  assert.equal(stored.phone_hash.includes('3525550100'), false);
  const [session] = await sql`SELECT token_hash FROM volunteer_sessions WHERE account_id = ${login.account.id} LIMIT 1`;
  assert.notEqual(session.token_hash, login.token);
  assert.ok(await accountForSession(login.token));
  await revokeAccountSession(login.token);
  assert.equal(await accountForSession(login.token), null);
  assert.ok(await accountForSession(secondDevice.token), 'Signing out one device must not sign out the other');
  await sql`UPDATE volunteer_sessions SET expires_at = 0 WHERE account_id = ${login.account.id}`;
  assert.equal(await accountForSession(secondDevice.token), null);
  assert.equal(await accountForSession('forged'), null);
});

void test('account booking, cross-device changes, duplicate prevention and forged cancellation use the authenticated identity', async () => {
  const input = profile(41, []);
  assert.equal(await authenticateAccount(input.email, input.phone), null);
  const login = await authenticateAccount(input.email, input.phone, true);
  assert.ok(login);
  const first = await slot('account-book');
  const overlapping = await slot('account-overlap');
  const target = await slot('account-target', 3, 10);
  assert.equal((await claimBrowserShifts({ ...input, shiftIds: [first] }, login.account.management_key, login.account.id)).ok, true);
  assert.equal((await claimBrowserShifts({ ...input, shiftIds: [overlapping] }, login.account.management_key, login.account.id)).ok, false);
  assert.equal((await claimBrowserShifts({ ...input, shiftIds: [first] }, login.account.management_key, login.account.id)).ok, false);
  assert.equal((await claimBrowserShifts({ ...input, email: profile(42, []).email, shiftIds: [target] }, login.account.management_key, login.account.id)).ok, false);
  const secondDevice = await authenticateAccount(input.email, input.phone);
  assert.ok(secondDevice);
  const [booking] = (await getBrowserDashboard(secondDevice.account.management_key)).shifts;
  assert.equal(await cancelBrowserSignup(booking.signupId, key()), false);
  assert.equal((await changeBrowserSignup(booking.signupId, target, secondDevice.account.management_key)).ok, true);
  assert.equal((await getBrowserDashboard(login.account.management_key)).shifts[0].id, target);
  assert.equal(await cancelBrowserSignup(booking.signupId, secondDevice.account.management_key), true);
  assert.equal((await getBrowserDashboard(login.account.management_key)).shifts.length, 0);
});
