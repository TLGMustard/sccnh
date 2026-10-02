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

void test('escapes volunteer text and uses only the configured application origin', () => {
  const message = buildShiftConfirmation({
    ...input,
    firstName: '<img src=x onerror=alert(1)>',
    location: '<script>alert(1)</script>',
    appBaseUrl: 'https://signup.example/private/path',
  });
  assert.doesNotMatch(message.html, /<img|<script/i);
  assert.match(message.html, /&lt;img/);
  assert.match(message.html, /href="https:\/\/signup\.example"/);
  assert.doesNotMatch(message.html, /private\/path/);
});
