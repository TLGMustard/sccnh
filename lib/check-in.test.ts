import assert from 'node:assert/strict';
import test from 'node:test';
import { checkInDecision } from './check-in.ts';

test('blocks a new check-in when general training is incomplete', () => {
  assert.deepEqual(checkInDecision({ checkingIn: true, trainingComplete: false }), { allowed: false, message: 'Complete training before check-in.' });
});

test('allows trained check-in and always allows removing a check-in', () => {
  assert.equal(checkInDecision({ checkingIn: true, trainingComplete: true }).allowed, true);
  assert.equal(checkInDecision({ checkingIn: false, trainingComplete: false }).allowed, true);
});
