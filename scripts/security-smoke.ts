import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { randomUUID } from 'node:crypto';

const configuredBase = process.env.APP_BASE_URL ?? '';
if (!configuredBase) throw new Error('APP_BASE_URL is required.');
const base = new URL(configuredBase);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('APP_BASE_URL must be an HTTP(S) origin without credentials.');
const origin = base.origin;

type HttpResult = { status: number; headers: Headers; text: string };

async function request(path: string, init?: RequestInit): Promise<HttpResult> {
  const response = await fetch(new URL(path, origin), { redirect: 'manual', ...init });
  return { status: response.status, headers: response.headers, text: await response.text() };
}

async function jsonPost(path: string, value: unknown, headers: Record<string, string> = {}): Promise<HttpResult> {
  return request(path, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) });
}

function assertSecurityHeaders(result: HttpResult, label: string): void {
  for (const name of ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy']) {
    assert.ok(result.headers.get(name), `${label} is missing ${name}`);
  }
  assert.equal(result.headers.get('x-frame-options'), 'DENY');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
}

function assertPrivate(result: HttpResult, label: string): void {
  assert.match(result.headers.get('cache-control') ?? '', /no-store/i, `${label} may be cached`);
  assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
}

function containsForbiddenKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  return Object.entries(value).some(([key, child]) => ['email', 'phone', 'accessCode', 'access_code_hash'].includes(key) || containsForbiddenKey(child));
}

async function chunkedOversizedPost(): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const client = base.protocol === 'https:' ? https : http;
    const req = client.request({
      protocol: base.protocol,
      hostname: base.hostname,
      port: base.port || undefined,
      path: new URL('/api/site', origin).pathname,
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.write('{"padding":"');
    req.write('x'.repeat(9_000));
    req.end('"}');
  });
}

const root = await request('/');
assert.equal(root.status, 200);
assertSecurityHeaders(root, '/');

const adminPage = await request('/admin');
assert.equal(adminPage.status, 200);
assertSecurityHeaders(adminPage, '/admin');

const site = await request('/api/site');
assert.equal(site.status, 200);
assertPrivate(site, '/api/site');
const publicPayload: unknown = JSON.parse(site.text);
assert.equal(containsForbiddenKey(publicPayload), false, 'public schedule contains a private contact field');

const anonymousAdmin = await request('/api/admin');
assert.equal(anonymousAdmin.status, 401);
assertPrivate(anonymousAdmin, '/api/admin');

for (const [path, body] of [
  ['/api/site', { action: 'mine', email: 'nobody@example.invalid', accessCode: 'NotARealCode!23' }],
  ['/api/verification', { action: 'request', email: 'nobody@example.invalid' }],
  ['/api/admin/session', { accessCode: 'NotARealCode!23' }],
] as const) {
  const result = await request(path, { method: 'POST', headers: { origin: 'https://attacker.invalid', 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, body: JSON.stringify(body) });
  assert.equal(result.status, 403, `${path} accepted a foreign origin`);
}

const malformed = await request('/api/site', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{' });
assert.equal(malformed.status, 400);
const nonJson = await request('/api/site', { method: 'POST', headers: { origin, 'content-type': 'text/plain' }, body: 'hello' });
assert.equal(nonJson.status, 415);
const declaredOversized = await request('/api/site', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(9_000) }) });
assert.equal(declaredOversized.status, 413);
const chunkedOversized = await chunkedOversizedPost();
assert.equal(chunkedOversized.status, 413);

const testEmail = process.env.SECURITY_TEST_EMAIL;
const testAccessCode = process.env.SECURITY_TEST_ACCESS_CODE;
const testShiftId = process.env.SECURITY_TEST_SHIFT_ID;
let forgedSignupId: string = randomUUID();
if (testEmail && testAccessCode && testShiftId) {
  const mine = await jsonPost('/api/site', { action: 'mine', email: testEmail, accessCode: testAccessCode });
  assert.equal(mine.status, 200, 'controlled volunteer credentials were rejected');
  const dashboard = JSON.parse(mine.text) as { dashboard?: { shifts?: { id: string; signupId: string }[] } };
  forgedSignupId = dashboard.dashboard?.shifts?.find((shift) => shift.id === testShiftId)?.signupId ?? forgedSignupId;
}
const forgedCancel = await jsonPost('/api/site', { action: 'cancel', signupId: forgedSignupId, email: testEmail ?? `security-smoke-${randomUUID()}@example.invalid`, accessCode: 'DefinitelyWrong!23' });
assert.ok([404, 409].includes(forgedCancel.status), 'forged cancellation was not rejected');
assert.doesNotMatch(forgedCancel.text, /exists|email|access code/i, 'forged cancellation revealed account state');

if (process.env.SECURITY_TEST_RATE_LIMITS === 'true') {
  const lookupEmail = `security-limit-${randomUUID()}@example.invalid`;
  const lookupResults = [];
  for (let index = 0; index < 9; index += 1) lookupResults.push(await jsonPost('/api/site', { action: 'mine', email: lookupEmail, accessCode: 'DefinitelyWrong!23' }, { 'x-forwarded-for': `203.0.113.${index + 1}, 192.0.2.240` }));
  assert.equal(lookupResults.at(-1)?.status, 429, 'volunteer lookup limit did not engage');

  const loginResults = [];
  for (let index = 0; index < 9; index += 1) loginResults.push(await jsonPost('/api/admin/session', { accessCode: 'DefinitelyWrong!23' }, { 'x-forwarded-for': `198.51.100.${index + 1}, 192.0.2.241` }));
  assert.equal(loginResults.at(-1)?.status, 429, 'organizer login limit did not engage');
} else {
  console.log('Rate-limit saturation skipped. Set SECURITY_TEST_RATE_LIMITS=true only in a controlled window.');
}

const hostileHost = await request('/', { headers: { 'x-forwarded-host': 'attacker.invalid', 'x-forwarded-proto': 'https' } });
assert.doesNotMatch(hostileHost.text, /attacker\.invalid/i, 'proxy host input was reflected into the page');

console.log('Security smoke checks passed.');
