import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVerificationEmail } from './verification-email.ts';

void test('builds a short verification message without unrelated markup', () => {
  const message = buildVerificationEmail('person@example.com', '123456');
  assert.equal(message.to, 'person@example.com');
  assert.match(message.text, /123456/);
  assert.match(message.text, /10 minutes/);
  assert.doesNotMatch(message.html, /<script>/i);
});

void test('escapes unexpected verification content in HTML', () => {
  const message = buildVerificationEmail('person@example.com', '<script>alert(1)</script>');
  assert.doesNotMatch(message.html, /<script>/i);
  assert.match(message.html, /&lt;script&gt;/i);
});
