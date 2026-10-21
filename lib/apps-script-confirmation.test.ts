import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

type DeliveryResult = { delivered: boolean; configured: boolean };
type Send = (input: Record<string, unknown>, config: Record<string, string>, fetcher: typeof fetch) => Promise<DeliveryResult>;

async function sender(): Promise<Send> {
  const loaded = await import('./apps-script-confirmation.ts').catch(() => ({
    sendAppsScriptConfirmation: async () => ({ delivered: false, configured: false }),
  }));
  return loaded.sendAppsScriptConfirmation as Send;
}

const config = {
  url: 'https://script.google.com/a/macros/ufhillel.org/s/example/exec',
  secret: 'a-very-long-test-only-shared-secret-value',
};

const receipt = {
  email: 'ana@example.edu',
  firstName: 'Ana',
  appOrigin: 'https://creamcheese.up.railway.app',
  shifts: [{ date: '2027-01-28', startsAt: '2027-01-28T08:00:00-05:00', endsAt: '2027-01-28T08:30:00-05:00', location: 'Turlington Plaza', role: 'Tabling' }],
};

void test('sends an Apps Script receipt as a signed, private payload', async () => {
  let observedUrl = '';
  let observedBody = '';
  const result = await (await sender())(receipt, config, async (url, init) => {
    observedUrl = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    observedBody = typeof init?.body === 'string' ? init.body : '';
    return new Response('{"ok":true}', { status: 200 });
  });

  assert.deepEqual(result, { delivered: true, configured: true });
  assert.equal(observedUrl, config.url);
  assert.doesNotMatch(observedUrl, /ana@example\.edu|secret/i);
  const envelope = JSON.parse(observedBody) as { payload: string; signature: string };
  assert.match(envelope.payload, /^[A-Za-z0-9_-]+$/);
  assert.equal(envelope.signature, createHmac('sha256', config.secret).update(envelope.payload).digest('base64url'));
  const payload = JSON.parse(Buffer.from(envelope.payload, 'base64url').toString('utf8'));
  assert.equal(payload.receipt.email, 'ana@example.edu');
  assert.equal(payload.receipt.shifts[0].location, 'Turlington Plaza');
  assert.equal(payload.receipt.shifts[0].role, 'Tabling');
  assert.equal(payload.appOrigin, 'https://creamcheese.up.railway.app');
  assert.equal(typeof payload.timestamp, 'number');
  assert.match(payload.nonce, /^[A-Za-z0-9_-]{20,}$/);
});

void test('does not attempt delivery without a complete Apps Script configuration', async () => {
  let called = false;
  const result = await (await sender())(receipt, { url: '', secret: '' }, async () => {
    called = true;
    return new Response('', { status: 200 });
  });
  assert.deepEqual(result, { delivered: false, configured: false });
  assert.equal(called, false);
});

void test('rejects an Apps Script URL with credentials, a query, fragment, or a non-exec path', async () => {
  for (const url of [
    'https://secret@script.google.com/a/macros/ufhillel.org/s/example/exec',
    'https://script.google.com/a/macros/ufhillel.org/s/example/exec?secret=not-allowed',
    'https://script.google.com/a/macros/ufhillel.org/s/example/exec#not-allowed',
    'https://script.google.com/a/macros/ufhillel.org/s/example/dev',
  ]) {
    let called = false;
    const result = await (await sender())(receipt, { ...config, url }, async () => {
      called = true;
      return new Response('{"ok":true}', { status: 200 });
    });
    assert.deepEqual(result, { delivered: false, configured: false });
    assert.equal(called, false);
  }
});

void test('reports a failed Apps Script response without exposing receipt data', async () => {
  const result = await (await sender())(receipt, config, async () => new Response('unavailable', { status: 503 }));
  assert.deepEqual(result, { delivered: false, configured: true });
});

void test('requires the Apps Script to explicitly confirm delivery', async () => {
  const result = await (await sender())(receipt, config, async () => new Response('{"ok":false}', { status: 200 }));
  assert.deepEqual(result, { delivered: false, configured: true });
});
