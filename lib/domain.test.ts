import assert from 'node:assert/strict';
import test from 'node:test';

import {
  availability,
  eventPhase,
  normalizeEmail,
  validateShiftWindow,
} from './domain.ts';

void test('normalizes a volunteer email before identity matching', () => {
  assert.equal(normalizeEmail('  Benny@UFL.EDU  '), 'benny@ufl.edu');
});

void test('computes availability from confirmed and checked-in signups only', () => {
  assert.deepEqual(
    availability(5, ['confirmed', 'cancelled', 'checked_in']),
    { capacity: 5, filled: 2, remaining: 3, state: 'open' },
  );
});

void test('marks a shift full when all capacity is occupied', () => {
  assert.equal(availability(2, ['confirmed', 'checked_in']).state, 'full');
});

void test('rejects an overnight or backwards shift window', () => {
  assert.equal(
    validateShiftWindow('2027-01-27T16:00:00-05:00', '2027-01-27T16:30:00-05:00'),
    null,
  );
  assert.match(
    validateShiftWindow('2027-01-27T16:00:00-05:00', '2027-01-27T04:10:00-05:00') ?? '',
    /after its start/i,
  );
});

void test('derives the signup phase from real event boundaries', () => {
  assert.equal(eventPhase('2026-09-11T12:00:00Z'), 'before');
  assert.equal(eventPhase('2027-01-26T12:00:00-05:00'), 'during');
  assert.equal(eventPhase('2027-02-01T12:00:00-05:00'), 'after');
});
