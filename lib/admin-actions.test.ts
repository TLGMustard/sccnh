import assert from 'node:assert/strict';
import test from 'node:test';
import { volunteerRemovalDecision } from './admin-actions.ts';

void test('only accepts a volunteer id that can identify one record for removal', () => {
  assert.deepEqual(volunteerRemovalDecision('not-a-volunteer-id'), { ok: false, message: 'Volunteer not found.' });
  assert.deepEqual(volunteerRemovalDecision('0f63d13c-6d58-4b46-b1a7-b153e75bb47f'), { ok: true });
});
