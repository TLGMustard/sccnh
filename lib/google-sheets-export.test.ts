import assert from 'node:assert/strict';
import test from 'node:test';
import { signupCsv, signupRows } from './google-sheets-export.ts';
import type { AdminSnapshot } from './repository.ts';

const snapshot = {
  shifts: [{ id: 'shift-1', day: '2027-01-28', startsAt: '2027-01-28T08:00:00-05:00', endsAt: '2027-01-28T08:30:00-05:00' }],
  signups: [{ id: 'signup-1', shiftId: 'shift-1', startsAt: '2027-01-28T08:00:00-05:00', locationName: 'Turlington', taskName: 'Volunteering', volunteerName: '=HYPERLINK("bad")', email: 'person@example.com', phone: '3525550100', status: 'confirmed', trainingComplete: false }],
} as AdminSnapshot;

void test('exports the named volunteer and exact Bagel Day shift for Sheets', () => {
  const rows = signupRows(snapshot);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1].slice(0, 5), ['Thu, Jan 28', '8:00–8:30 AM', 'Turlington', 'Volunteering', '=HYPERLINK("bad")']);
  assert.equal(rows[1][5], 'person@example.com');
});

void test('CSV export escapes spreadsheet formulas and quotation marks', () => {
  const csv = signupCsv(snapshot);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
  assert.match(csv, /"person@example.com"/);
});
