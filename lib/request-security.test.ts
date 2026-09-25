import assert from 'node:assert/strict';
import test from 'node:test';
import { createRateLimiter, isDeclaredJsonBodyTooLarge, parseJsonRequest, sensitiveResponseHeaders } from './request-security.ts';

void test('rejects non-JSON requests before application code reads them', () => {
  assert.deepEqual(parseJsonRequest('text/plain', '{"action":"mine"}'), { ok: false, status: 415 });
});

void test('rejects malformed or oversized JSON requests', () => {
  assert.deepEqual(parseJsonRequest('application/json', '{'), { ok: false, status: 400 });
  assert.deepEqual(parseJsonRequest('application/json', `{"code":"${'x'.repeat(8200)}"}`), { ok: false, status: 413 });
});

void test('rejects an oversized declared body before reading it', () => {
  assert.equal(isDeclaredJsonBodyTooLarge('8192'), false);
  assert.equal(isDeclaredJsonBodyTooLarge('8193'), true);
  assert.equal(isDeclaredJsonBodyTooLarge('not-a-number'), false);
});

void test('accepts a small JSON object', () => {
  assert.deepEqual(parseJsonRequest('application/json; charset=utf-8', '{"action":"mine"}'), { ok: true, value: { action: 'mine' } });
});

void test('limits repeated access attempts and clears the window later', () => {
  const limit = createRateLimiter(2, 60_000);
  assert.equal(limit.allow('198.51.100.10', 0), true);
  assert.equal(limit.allow('198.51.100.10', 1), true);
  assert.equal(limit.allow('198.51.100.10', 2), false);
  assert.equal(limit.allow('198.51.100.10', 60_001), true);
});

void test('marks private responses as non-cacheable and non-referring', () => {
  assert.equal(sensitiveResponseHeaders['Cache-Control'], 'no-store, private');
  assert.equal(sensitiveResponseHeaders['Referrer-Policy'], 'no-referrer');
  assert.equal(sensitiveResponseHeaders['X-Content-Type-Options'], 'nosniff');
});
