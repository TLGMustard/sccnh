import assert from 'node:assert/strict';
import test from 'node:test';
import { adminCookieName, createAdminSession, readAdminSession } from './admin-session.ts';

void test('accepts a valid signed organizer session', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const claims = { sessionId: 'session-1', issuedAt: now, expiresAt: now + 4 * 60 * 60_000 };
  const token = createAdminSession('a'.repeat(32), claims);
  assert.deepEqual(readAdminSession(token, 'a'.repeat(32), now), claims);
});

void test('rejects a forged or expired organizer session', () => {
  const secret = 'a'.repeat(32);
  const claims = { sessionId: 'session-1', issuedAt: 900_000_000_000, expiresAt: 900_000_000_000 + 4 * 60 * 60_000 };
  const token = createAdminSession(secret, claims);
  assert.equal(readAdminSession(`${token}changed`, secret, claims.issuedAt), null);
  assert.equal(readAdminSession(token, secret, claims.expiresAt), null);
  assert.throws(() => createAdminSession('short', claims));
  assert.throws(() => createAdminSession(secret, { ...claims, expiresAt: claims.expiresAt + 1 }));
});

void test('uses a host-only production cookie and a local development cookie', () => {
  assert.equal(adminCookieName(true), '__Host-sccnh_admin');
  assert.equal(adminCookieName(false), 'sccnh_admin');
});
