import assert from 'node:assert/strict';
import test from 'node:test';
import { initialVerificationState, signupNextStep, verificationReducer } from './signup-verification-state.ts';

void test('claims directly when verification is disabled or the server may know an existing account', () => {
  assert.equal(signupNextStep(false, initialVerificationState, 'person@example.com'), 'claim');
  assert.equal(signupNextStep(true, initialVerificationState, 'person@example.com'), 'claim');
});

void test('opens code entry after the server requires first-signup verification', () => {
  const state = verificationReducer(initialVerificationState, { type: 'code-requested', email: 'person@example.com' });
  assert.deepEqual(state, { phase: 'code-sent', email: 'person@example.com' });
  assert.equal(signupNextStep(true, state, 'person@example.com'), 'confirm');
});

void test('confirmed email retries the pending claim', () => {
  const state = verificationReducer({ phase: 'code-sent', email: 'person@example.com' }, { type: 'confirmed', email: 'person@example.com' });
  assert.deepEqual(state, { phase: 'verified', email: 'person@example.com' });
  assert.equal(signupNextStep(true, state, 'person@example.com'), 'claim');
});

void test('changing email or resetting clears verified UI state', () => {
  const verified = { phase: 'verified' as const, email: 'first@example.com' };
  assert.deepEqual(verificationReducer(verified, { type: 'email-changed', email: 'second@example.com' }), initialVerificationState);
  assert.deepEqual(verificationReducer(verified, { type: 'reset' }), initialVerificationState);
});
