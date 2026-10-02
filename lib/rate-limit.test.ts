import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRateBucketKey, rateBucketStart, rateLimitDecision } from './rate-limit.ts';

void test('changes rate buckets exactly at the window boundary', () => {
  assert.equal(rateBucketStart(899_999, 900_000), 0);
  assert.equal(rateBucketStart(900_000, 900_000), 900_000);
});

void test('builds a scoped bucket without the raw identity', () => {
  const key = buildRateBucketKey({ scope: 'mine', limit: 8, windowMs: 900_000 }, 'person@example.com', 's'.repeat(32), 900_001);
  assert.match(key, /^mine:900000:[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(key, /person@example\.com/);
});

void test('allows through the limit and reports retry time after it', () => {
  assert.deepEqual(rateLimitDecision(8, 8, 900_001, 900_000, 900_000), { allowed: true, retryAfterSeconds: 900 });
  assert.deepEqual(rateLimitDecision(9, 8, 900_001, 900_000, 900_000), { allowed: false, retryAfterSeconds: 900 });
});
