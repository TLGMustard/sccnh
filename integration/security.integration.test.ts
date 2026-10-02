import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import postgres from 'postgres';
import { LOCATIONS, TASKS } from '../lib/event.ts';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('TEST_DATABASE_URL is required.');
if (/railway\.app|proxy\.rlwy\.net/i.test(testUrl) && process.env.ALLOW_REMOTE_SECURITY_TESTS !== 'true') {
  throw new Error('Refusing to run integration tests against a remote Railway database.');
}

process.env.DATABASE_URL = testUrl;
process.env.EMAIL_VERIFICATION_REQUIRED = 'false';

const { claimShift, changeSignup, getPublicSnapshot, updateCapacity } = await import('../lib/repository.ts');
const sql = postgres(testUrl, { max: 24, prepare: false });
const prefix = `security-${randomUUID()}`;
const accessCode = 'Integration!234';

function profile(index: number, shiftId: string) {
  return {
    shiftId,
    firstName: 'Security',
    lastName: `Test${index}`,
    email: `${prefix}-${index}@example.test`,
    phone: '3525550100',
    wantsSiteLead: false,
    accessCode,
  };
}

async function createShift(suffix: string, capacity: number): Promise<string> {
  const id = `${prefix}-${suffix}`;
  await sql`INSERT INTO shifts (id, day, location_id, task_id, starts_at, ends_at, capacity, title, description, is_active)
    VALUES (${id}, '2027-01-25', ${LOCATIONS[0].id}, ${TASKS[0].id}, '2027-01-25T08:00:00-05:00', '2027-01-25T08:30:00-05:00', ${capacity}, 'Security test', '', true)`;
  return id;
}

before(async () => {
  await getPublicSnapshot();
});

after(async () => {
  await sql`DELETE FROM signups WHERE shift_id LIKE ${`${prefix}%`}`;
  await sql`DELETE FROM volunteers WHERE email LIKE ${`${prefix}%`}`;
  await sql`DELETE FROM shifts WHERE id LIKE ${`${prefix}%`}`;
  await sql.end();
});

void test('concurrent claims cannot exceed capacity', async () => {
  const shiftId = await createShift('claims', 3);
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) => claimShift(profile(index, shiftId))));
  assert.equal(results.filter((result) => result.ok).length, 3);
  assert.equal(results.filter((result) => !result.ok && result.code === 'full').length, 17);
  const [row] = await sql<{ occupied: number }[]>`SELECT COUNT(*)::int AS occupied FROM signups WHERE shift_id = ${shiftId} AND status IN ('confirmed', 'checked_in')`;
  assert.equal(row.occupied, 3);
});

void test('capacity changes and claims preserve capacity at or above occupancy', async () => {
  const shiftId = await createShift('capacity-race', 3);
  assert.equal((await claimShift(profile(100, shiftId))).ok, true);
  await Promise.all([claimShift(profile(101, shiftId)), updateCapacity(shiftId, 1)]);
  const [row] = await sql<{ capacity: number; occupied: number }[]>`SELECT s.capacity, COUNT(sg.id)::int AS occupied
    FROM shifts s LEFT JOIN signups sg ON sg.shift_id = s.id AND sg.status IN ('confirmed', 'checked_in')
    WHERE s.id = ${shiftId} GROUP BY s.id`;
  assert.ok(row.capacity >= row.occupied);
});

void test('a full change target leaves the original signup confirmed', async () => {
  const sourceId = await createShift('source', 2);
  const targetId = await createShift('target', 1);
  const source = await claimShift(profile(200, sourceId));
  assert.equal(source.ok, true);
  assert.equal((await claimShift(profile(201, targetId))).ok, true);
  if (!source.ok) return;

  const signupId = source.dashboard.shifts.find((shift) => shift.id === sourceId)?.signupId;
  assert.ok(signupId);
  const changed = await changeSignup({ signupId, targetShiftId: targetId, email: profile(200, sourceId).email, accessCode });
  assert.equal(changed.ok, false);
  if (!changed.ok) assert.equal(changed.code, 'full');
  const [row] = await sql<{ status: string }[]>`SELECT status FROM signups WHERE id = ${signupId}`;
  assert.equal(row.status, 'confirmed');
});
