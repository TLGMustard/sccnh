import assert from 'node:assert/strict';
import test from 'node:test';
import { hashAccessCode, validateAccessCode, verifyAccessCode } from './access-code.ts';

test('accepts a trimmed 12-character access code', () => {
  assert.equal(validateAccessCode('  blue-orange-27  '), 'blue-orange-27');
});

test('rejects short or oversized access codes', () => {
  assert.equal(validateAccessCode('too-short'), null);
  assert.equal(validateAccessCode('x'.repeat(129)), null);
});

test('stores a non-plaintext access-code hash', async () => {
  const encoded = await hashAccessCode('blue-orange-27');
  assert.notEqual(encoded, 'blue-orange-27');
  assert.match(encoded, /^scrypt\$32768\$8\$3\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
});

test('verifies only the original access code', async () => {
  const encoded = await hashAccessCode('blue-orange-27');
  assert.equal(await verifyAccessCode('blue-orange-27', encoded), true);
  assert.equal(await verifyAccessCode('blue-orange-28', encoded), false);
});
