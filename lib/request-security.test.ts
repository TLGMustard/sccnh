import assert from 'node:assert/strict';
import test from 'node:test';
import { createRateLimiter, isDeclaredJsonBodyTooLarge, parseJsonRequest, readJsonRequest, requireSameOrigin, sensitiveResponseHeaders } from './request-security.ts';

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

void test('stops a chunked body after 8192 bytes', async () => {
  const request = new Request('https://creamcheese.up.railway.app/api/site', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://creamcheese.up.railway.app' },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"'));
        controller.enqueue(new Uint8Array(8192).fill(120));
        controller.enqueue(new TextEncoder().encode('"}'));
        controller.close();
      },
    }),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  assert.deepEqual(await readJsonRequest(request), { ok: false, status: 413 });
});

void test('rejects malformed UTF-8 without buffering it as text', async () => {
  const request = new Request('https://creamcheese.up.railway.app/api/site', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: new Uint8Array([0xc3, 0x28]),
  });
  assert.deepEqual(await readJsonRequest(request), { ok: false, status: 400 });
});

void test('rejects a foreign browser origin and cross-site fetch metadata', () => {
  const foreign = new Request('https://creamcheese.up.railway.app/api/site', {
    method: 'POST', headers: { origin: 'https://attacker.example' },
  });
  const crossSite = new Request('https://creamcheese.up.railway.app/api/site', {
    method: 'POST', headers: { origin: 'https://creamcheese.up.railway.app', 'sec-fetch-site': 'cross-site' },
  });
  assert.equal(requireSameOrigin(foreign, 'https://creamcheese.up.railway.app', true), false);
  assert.equal(requireSameOrigin(crossSite, 'https://creamcheese.up.railway.app', true), false);
});

void test('requires origin in production but permits non-browser local requests', () => {
  const request = new Request('http://localhost:3000/api/site', { method: 'POST' });
  assert.equal(requireSameOrigin(request, 'https://creamcheese.up.railway.app', true), false);
  assert.equal(requireSameOrigin(request, 'http://localhost:3000', false), true);
});
