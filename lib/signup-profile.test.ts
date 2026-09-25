import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSignupProfile } from './signup-profile.ts';

void test('requires a usable phone number', () => {
  assert.equal(normalizeSignupProfile({ firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '', wantsSiteLead: false }).ok, false);
  assert.equal(normalizeSignupProfile({ firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '123', wantsSiteLead: false }).ok, false);
});

void test('normalizes contact data and accepts only literal true for site-lead interest', () => {
  const result = normalizeSignupProfile({ firstName: ' Ana ', lastName: ' Lee ', email: ' ANA@UFL.EDU ', phone: '(352) 555-0199', wantsSiteLead: 'false' });
  assert.deepEqual(result, { ok: true, value: { firstName: 'Ana', lastName: 'Lee', email: 'ana@ufl.edu', phone: '(352) 555-0199', wantsSiteLead: false } });
  assert.equal(normalizeSignupProfile({ firstName: 'Ana', lastName: 'Lee', email: 'ana@ufl.edu', phone: '352-555-0199', wantsSiteLead: true }).ok, true);
});
