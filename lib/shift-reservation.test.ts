import assert from 'node:assert/strict';
import test from 'node:test';
import * as reservations from './shift-reservation.ts';

const { shiftReservationDecision } = reservations;

void test('rejects an inactive shift even when it has open capacity', () => {
  assert.deepEqual(shiftReservationDecision({ exists: true, isActive: false, capacity: 20, filled: 0 }), { ok: false, code: 'not_found', message: 'That shift is unavailable.' });
});

void test('distinguishes a full active shift from an available shift', () => {
  const full = shiftReservationDecision({ exists: true, isActive: true, capacity: 20, filled: 20 });
  assert.equal(full.ok, false);
  if (full.ok) assert.fail('Expected a full-shift decision.');
  assert.equal(full.code, 'full');
  assert.deepEqual(shiftReservationDecision({ exists: true, isActive: true, capacity: 20, filled: 19 }), { ok: true });
});

void test('keeps the current shift when a replacement is invalid or unavailable', () => {
  type Decision = { ok: true } | { ok: false; code: 'not_found' | 'full' | 'same_shift'; message: string };
  const change = (reservations as unknown as { shiftChangeDecision?: (input: { sourceExists: boolean; sourceShiftId: string; targetShiftId: string; targetExists: boolean; targetIsActive: boolean; targetCapacity: number; targetFilled: number }) => Decision }).shiftChangeDecision;
  assert.equal(typeof change, 'function');
  if (!change) return;

  assert.deepEqual(change({ sourceExists: true, sourceShiftId: 'current', targetShiftId: 'current', targetExists: true, targetIsActive: true, targetCapacity: 5, targetFilled: 1 }), { ok: false, code: 'same_shift', message: 'Choose a different shift.' });
  assert.deepEqual(change({ sourceExists: true, sourceShiftId: 'current', targetShiftId: 'full', targetExists: true, targetIsActive: true, targetCapacity: 5, targetFilled: 5 }), { ok: false, code: 'full', message: 'That shift just filled.' });
  assert.deepEqual(change({ sourceExists: true, sourceShiftId: 'current', targetShiftId: 'open', targetExists: true, targetIsActive: true, targetCapacity: 5, targetFilled: 4 }), { ok: true });
});

void test('never lowers capacity below occupied places', () => {
  const decide = (reservations as unknown as { capacityUpdateDecision?: (input: { exists: boolean; requested: number; filled: number }) => { ok: boolean; message?: string } }).capacityUpdateDecision;
  assert.equal(typeof decide, 'function');
  if (!decide) return;

  assert.deepEqual(decide({ exists: false, requested: 10, filled: 0 }), { ok: false, message: 'Shift not found.' });
  assert.deepEqual(decide({ exists: true, requested: 2, filled: 3 }), { ok: false, message: 'Capacity cannot be below current signups.' });
  assert.deepEqual(decide({ exists: true, requested: 3, filled: 3 }), { ok: true });
});
