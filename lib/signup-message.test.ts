import assert from 'node:assert/strict';
import test from 'node:test';

type Message = (value: unknown) => string;

async function savedMessage(): Promise<Message> {
  const loaded = await import('./signup-message.ts').catch(() => ({ savedSignupMessage: () => 'Shifts saved. Keep using this browser to view or change them.' }));
  return loaded.savedSignupMessage as Message;
}

void test('preserves the server receipt result after a successful signup', async () => {
  const message = await savedMessage();
  assert.equal(message('Shifts saved. Confirmation email sent. View them in My shifts on this browser.'), 'Shifts saved. Confirmation email sent. View them in My shifts on this browser.');
});

void test('falls back to a neutral saved message when the server result is missing', async () => {
  const message = await savedMessage();
  assert.equal(message(null), 'Shifts saved. View them in My shifts on this browser.');
});
