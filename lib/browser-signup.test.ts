import assert from 'node:assert/strict';
import test from 'node:test';
import { browserCookieName, browserManagementKey, newBrowserToken, selectedShiftIds, shiftsOverlap, validBrowserToken } from './browser-signup.ts';

void test('browser capability is random and stored only as a digest', () => {
  const first = newBrowserToken();
  assert.ok(validBrowserToken(first));
  assert.notEqual(first, newBrowserToken());
  assert.equal(browserManagementKey(first), browserManagementKey(first));
  assert.notEqual(browserManagementKey(first), first);
  assert.notEqual(browserManagementKey(first), browserManagementKey(newBrowserToken()));
  assert.throws(() => browserManagementKey('someone@example.com'));
  assert.equal(browserCookieName(true), '__Host-sccnh_volunteer');
});

void test('batch selection rejects duplicates, malformed and oversized inputs', () => {
  assert.deepEqual(selectedShiftIds(['b', 'a']), ['a', 'b']);
  for (const value of [[], ['a', 'a'], ['../admin'], [null], 'a', Array.from({ length: 21 }, (_, i) => `s-${i}`)]) assert.equal(selectedShiftIds(value), null);
});

void test('adjacent shifts are allowed while overlapping shifts are rejected', () => {
  const slot = (start: string, end: string) => ({ startsAt: `2027-01-28T${start}:00-05:00`, endsAt: `2027-01-28T${end}:00-05:00` });
  assert.equal(shiftsOverlap([slot('08:00', '08:30'), slot('08:30', '09:00')]), false);
  assert.equal(shiftsOverlap([slot('08:00', '09:00'), slot('08:30', '09:30')]), true);
});
