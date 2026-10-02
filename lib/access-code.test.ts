import assert from 'node:assert/strict';
import test from 'node:test';
import { DUMMY_ACCESS_CODE_HASH, hashAccessCode, validateAccessCode, verifyAccessCode, verifyStoredAccessCode } from './access-code.ts';

void test('accepts a trimmed 12-character access code', () => {
  assert.equal(validateAccessCode('  blue-orange-27  '), 'blue-orange-27');
});

void test('rejects short or oversized access codes', () => {
  assert.equal(validateAccessCode('too-short'), null);
  assert.equal(validateAccessCode('x'.repeat(129)), null);
});

void test('stores a non-plaintext access-code hash', async () => {
  const encoded = await hashAccessCode('blue-orange-27');
  assert.notEqual(encoded, 'blue-orange-27');
  assert.match(encoded, /^scrypt\$32768\$8\$3\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
});

void test('verifies only the original access code', async () => {
  const encoded = await hashAccessCode('blue-orange-27');
  assert.equal(await verifyAccessCode('blue-orange-27', encoded), true);
  assert.equal(await verifyAccessCode('blue-orange-28', encoded), false);
});

void test('uses a valid dummy hash when a credential row is absent', async () => {
  assert.match(DUMMY_ACCESS_CODE_HASH, /^scrypt\$32768\$8\$3\$/);
  assert.equal(await verifyStoredAccessCode('correct-length-code', null), false);
  assert.equal(await verifyStoredAccessCode('correct-length-code', DUMMY_ACCESS_CODE_HASH), false);
});
