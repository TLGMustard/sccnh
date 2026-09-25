import assert from 'node:assert/strict';
import test from 'node:test';
import { shiftReservationDecision } from './shift-reservation.ts';

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
