import assert from 'node:assert/strict';
import test from 'node:test';
import { attemptShiftConfirmation, buildShiftConfirmation } from './confirmation-email.ts';

const input = {
  to: 'ana@ufl.edu', firstName: 'Ana', location: 'Turlington Plaza',
  startsAt: '2027-01-27T08:00:00-05:00', endsAt: '2027-01-27T08:30:00-05:00',
  accessCode: 'must-never-appear', appBaseUrl: 'https://signup.example',
};

void test('builds a useful receipt without the access code', () => {
  const message = buildShiftConfirmation(input);
  assert.match(message.text, /Turlington Plaza/);
  assert.match(message.text, /1\.5-hour training/);
  assert.match(message.text, /SCCNH shirt/);
  assert.match(message.text, /https:\/\/signup\.example/);
  assert.doesNotMatch(JSON.stringify(message), /must-never-appear/);
});

void test('reports delivery failure without throwing away the reservation flow', async () => {
  assert.equal(await attemptShiftConfirmation(async () => { throw new Error('provider unavailable'); }), false);
  assert.equal(await attemptShiftConfirmation(async () => undefined), true);
});
