import assert from 'node:assert/strict';
import test from 'node:test';
import { EVENT, LOCATIONS, SHIFTS, TASKS } from './event.ts';

test('campus tabling covers 8 AM through 6 PM in 30-minute blocks', () => {
  for (const locationId of ['turlington', 'plaza']) {
    const shifts = SHIFTS.filter((shift) => shift.locationId === locationId && shift.taskId === 'tabling');
    assert.equal(shifts.length, 20);
    assert.equal(shifts[0].startsAt.slice(11, 16), '08:00');
    assert.equal(shifts.at(-1)?.endsAt.slice(11, 16), '18:00');
    assert.ok(shifts.every((shift) => Date.parse(shift.endsAt) - Date.parse(shift.startsAt) === 30 * 60_000));
  }
});

test('medical school offers eight one-hour shifts from 9 AM through 5 PM', () => {
  const shifts = SHIFTS.filter((shift) => shift.locationId === 'hpnp' && shift.taskId === 'tabling');
  assert.equal(shifts.length, 8);
  assert.equal(shifts[0].startsAt.slice(11, 16), '09:00');
  assert.equal(shifts.at(-1)?.endsAt.slice(11, 16), '17:00');
  assert.ok(shifts.every((shift) => Date.parse(shift.endsAt) - Date.parse(shift.startsAt) === 60 * 60_000));
});

test('publishes no law site and requires only one 1.5-hour training', () => {
  assert.equal(LOCATIONS.some((location) => /law/i.test(location.name)), false);
  assert.equal(SHIFTS.some((shift) => /law/i.test(shift.locationId)), false);
  assert.ok(TASKS.every((task) => task.training === 'general'));
  assert.deepEqual(EVENT.essentials, [
    'Training is 1.5 hours.',
    'Bring your SCCNH shirt. Event shirts are provided at training.',
    'Interested site leads will be contacted by the VC of Ops.',
  ]);
});
