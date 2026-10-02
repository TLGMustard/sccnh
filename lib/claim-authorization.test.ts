import assert from 'node:assert/strict';
import test from 'node:test';
import * as authorization from './claim-authorization.ts';

void test('unknown email and wrong existing access code use the same verification response path', () => {
  const decide = (authorization as unknown as { claimAuthorizationDecision?: (input: { verificationRequired: boolean; hasEmailProof: boolean; existingAccessVerified: boolean }) => string }).claimAuthorizationDecision;
  assert.equal(typeof decide, 'function');
  if (!decide) return;
  assert.equal(decide({ verificationRequired: true, hasEmailProof: false, existingAccessVerified: false }), 'verify-email');
});

void test('proof, a valid existing login, or disabled enforcement permits the claim', () => {
  const decide = (authorization as unknown as { claimAuthorizationDecision?: (input: { verificationRequired: boolean; hasEmailProof: boolean; existingAccessVerified: boolean }) => string }).claimAuthorizationDecision;
  assert.equal(typeof decide, 'function');
  if (!decide) return;
  assert.equal(decide({ verificationRequired: true, hasEmailProof: true, existingAccessVerified: false }), 'allow');
  assert.equal(decide({ verificationRequired: true, hasEmailProof: false, existingAccessVerified: true }), 'allow');
  assert.equal(decide({ verificationRequired: false, hasEmailProof: false, existingAccessVerified: false }), 'allow');
});
