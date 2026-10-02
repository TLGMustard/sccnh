import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedIdentifier, normalizeSignupProfile } from './signup-profile.ts';

void test('requires a usable phone number', () => {
  assert.equal(normalizeSignupProfile({ firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '', wantsSiteLead: false }).ok, false);
  assert.equal(normalizeSignupProfile({ firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '123', wantsSiteLead: false }).ok, false);
});

void test('normalizes contact data and accepts only literal true for site-lead interest', () => {
  const result = normalizeSignupProfile({ firstName: ' Ana ', lastName: ' Lee ', email: ' ANA@UFL.EDU ', phone: '(352) 555-0199', wantsSiteLead: 'false' });
  assert.deepEqual(result, { ok: true, value: { firstName: 'Ana', lastName: 'Lee', email: 'ana@ufl.edu', phone: '(352) 555-0199', wantsSiteLead: false } });
  assert.equal(normalizeSignupProfile({ firstName: 'Ana', lastName: 'Lee', email: 'ana@ufl.edu', phone: '352-555-0199', wantsSiteLead: true }).ok, true);
});

void test('rejects oversized or control-character contact fields', () => {
  const valid = { firstName: 'Ana', lastName: 'Lee', email: 'ana@ufl.edu', phone: '352-555-0199', wantsSiteLead: false };
  assert.equal(normalizeSignupProfile({ ...valid, firstName: 'x'.repeat(81) }).ok, false);
  assert.equal(normalizeSignupProfile({ ...valid, email: `${'x'.repeat(250)}@ufl.edu` }).ok, false);
  assert.equal(normalizeSignupProfile({ ...valid, phone: `352${'1'.repeat(30)}` }).ok, false);
  assert.equal(normalizeSignupProfile({ ...valid, phone: '1'.repeat(16) }).ok, false);
  assert.equal(normalizeSignupProfile({ ...valid, firstName: 'Ana\nAdmin' }).ok, false);
});

void test('accepts only bounded opaque record identifiers', () => {
  assert.equal(boundedIdentifier('shift_2027-01-27:0800'), 'shift_2027-01-27:0800');
  assert.equal(boundedIdentifier('x'.repeat(129)), null);
  assert.equal(boundedIdentifier('../volunteer'), null);
  assert.equal(boundedIdentifier(''), null);
});
