import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminSession, readAdminSession } from './admin-session.ts';

void test('accepts a valid signed organizer session', () => {
  const token = createAdminSession('a-really-long-organizer-secret', 2_000_000_000_000);
  assert.equal(readAdminSession(token, 'a-really-long-organizer-secret', 1_000_000_000_000), true);
});

void test('rejects a forged or expired organizer session', () => {
  const secret = 'a-really-long-organizer-secret';
  const token = createAdminSession(secret, 1_000_000_000_000);
  assert.equal(readAdminSession(`${token}changed`, secret, 900_000_000_000), false);
  assert.equal(readAdminSession(token, secret, 1_000_000_000_001), false);
});
