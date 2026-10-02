import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveApplicationOrigin } from './app-config.ts';

void test('requires a configured HTTPS production origin', () => {
  assert.throws(() => resolveApplicationOrigin('', 'https://forged.example', true));
  assert.throws(() => resolveApplicationOrigin('http://creamcheese.up.railway.app', '', true));
  assert.equal(resolveApplicationOrigin('https://creamcheese.up.railway.app/path', '', true), 'https://creamcheese.up.railway.app');
});

void test('rejects credentials and accepts local development fallback', () => {
  assert.throws(() => resolveApplicationOrigin('https://user:pass@example.com', '', true));
  assert.equal(resolveApplicationOrigin('', 'http://localhost:3100/api/site', false), 'http://localhost:3100');
});
