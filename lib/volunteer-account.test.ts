import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPhone, verifyPhone, normalizePhone, sessionDigest } from './volunteer-account.ts';

void test('phone credentials accept equivalent formatting and reject other numbers', async () => {
  const hash = await hashPhone('(352) 555-0100');
  assert.equal(hash.includes('3525550100'), false);
  assert.equal(await verifyPhone('+1 352-555-0100', hash), true);
  assert.equal(await verifyPhone('3525550101', hash), false);
  assert.equal(await verifyPhone('3525550100', undefined), false);
  assert.equal(await verifyPhone('3525550100', 'malformed'), false);
});

void test('phone credentials and session tokens reject malformed or excessive input', () => {
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone('x'.repeat(129)), null);
  assert.equal(normalizePhone('call3525550100'), null);
  assert.equal(normalizePhone('+1 (352) 555-0100'), '3525550100');
  assert.throws(() => sessionDigest('forged'));
  const token = 'A'.repeat(43);
  assert.match(sessionDigest(token), /^[a-f0-9]{64}$/);
  assert.notEqual(sessionDigest(token), token);
});
