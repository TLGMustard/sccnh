import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmailProof,
  createVerificationCode,
  digestVerificationCode,
  emailProofCookieName,
  readEmailProof,
  verificationAttemptDecision,
  verifyVerificationCode,
} from './email-verification.ts';

const secret = 'v'.repeat(32);

void test('verification codes are six digits and stored as keyed digests', () => {
  const code = createVerificationCode(() => 42_319);
  assert.equal(code, '042319');
  const digest = digestVerificationCode('request-1', code, secret);
  assert.doesNotMatch(digest, /042319/);
  assert.equal(verifyVerificationCode('request-1', code, digest, secret), true);
  assert.equal(verifyVerificationCode('request-1', '042318', digest, secret), false);
});

void test('email proof is bound to email digest and 15-minute expiry', () => {
  const now = 1_800_000_000_000;
  const claims = { emailKey: 'email-key', issuedAt: now, expiresAt: now + 15 * 60_000 };
  const token = createEmailProof(claims, secret);
  assert.deepEqual(readEmailProof(token, 'email-key', secret, now + 14 * 60_000), claims);
  assert.equal(readEmailProof(token, 'other-key', secret, now), null);
  assert.equal(readEmailProof(token, 'email-key', secret, now + 15 * 60_000), null);
  assert.equal(readEmailProof(`${token}changed`, 'email-key', secret, now), null);
  assert.equal(readEmailProof('malformed', 'email-key', secret, now), null);
});

void test('expires, consumes, and caps verification attempts', () => {
  const now = 1_800_000_000_000;
  assert.deepEqual(verificationAttemptDecision({ attempts: 0, consumedAt: null, expiresAt: now - 1 }, false, now), { allowed: false, attempts: 0, consume: false });
  assert.deepEqual(verificationAttemptDecision({ attempts: 0, consumedAt: now - 1, expiresAt: now + 1 }, true, now), { allowed: false, attempts: 0, consume: false });
  assert.deepEqual(verificationAttemptDecision({ attempts: 5, consumedAt: null, expiresAt: now + 1 }, false, now), { allowed: false, attempts: 6, consume: false });
  assert.deepEqual(verificationAttemptDecision({ attempts: 6, consumedAt: null, expiresAt: now + 1 }, true, now), { allowed: false, attempts: 6, consume: false });
  assert.deepEqual(verificationAttemptDecision({ attempts: 1, consumedAt: null, expiresAt: now + 1 }, true, now), { allowed: true, attempts: 2, consume: true });
});

void test('uses host-only production proof cookies', () => {
  assert.equal(emailProofCookieName(true), '__Host-sccnh_email_verified');
  assert.equal(emailProofCookieName(false), 'sccnh_email_verified');
});
