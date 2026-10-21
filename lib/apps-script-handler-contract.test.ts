import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

void test('Apps Script serializes replay cache access with a script lock', async () => {
  const source = await readFile(new URL('../docs/apps-script-confirmation-web-app.gs', import.meta.url), 'utf8');
  assert.match(source, /LockService\.getScriptLock\(\)/);
  assert.match(source, /tryLock\(5000\)/);
  assert.match(source, /finally\s*\{\s*lock\.releaseLock\(\);/);
  assert.ok(source.indexOf('lock.releaseLock();') < source.indexOf('MailApp.sendEmail('));
});
