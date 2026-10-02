import assert from 'node:assert/strict';
import test from 'node:test';
import { keyedDigest, requestNetworkIdentity } from './security-key.ts';

void test('keyed identifiers are stable, scoped, and redact raw identity', () => {
  const secret = 's'.repeat(32);
  const first = keyedDigest('mine', 'person@example.com', secret);
  assert.equal(first, keyedDigest('mine', 'person@example.com', secret));
  assert.notEqual(first, keyedDigest('claim', 'person@example.com', secret));
  assert.doesNotMatch(first, /person@example\.com/);
});

void test('rejects a short keying secret', () => {
  assert.throws(() => keyedDigest('mine', 'person@example.com', 'short'));
});

void test('uses only the rightmost valid forwarded address as a secondary network identity', () => {
  const forged = new Request('https://example.test', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.4' } });
  const fallback = new Request('https://example.test', { headers: { 'x-forwarded-for': 'not-an-ip', 'x-real-ip': '192.0.2.7' } });
  assert.equal(requestNetworkIdentity(forged), '10.0.0.4');
  assert.equal(requestNetworkIdentity(fallback), '192.0.2.7');
  assert.equal(requestNetworkIdentity(new Request('https://example.test')), 'unknown');
});
