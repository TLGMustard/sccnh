import assert from 'node:assert/strict';
import test from 'node:test';
import { exportCsv, signupExportRows, EXPORT_HEADERS } from './signup-export.ts';
import type { AdminSnapshot } from './repository';

void test('CSV escapes quoted names, newlines and spreadsheet formulas', () => {
  const csv = exportCsv([['A "name"', 'line\nbreak', '=HYPERLINK("x")', '  +123', '@SUM(1)', 'ordinary@example.test']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"A ""name"""'));
  assert.ok(csv.includes('"line\nbreak"'));
  assert.ok(csv.includes('"\'=HYPERLINK'));
  assert.ok(csv.includes('"\'  +123"'));
  assert.ok(csv.includes('"\'@SUM(1)"'));
  assert.ok(csv.includes('"ordinary@example.test"'));
});

void test('exports each volunteer with their exact shift and retains empty shifts', () => {
  const shift = { id: 'slot', day: '2027-01-28', startsAt: '2027-01-28T08:00:00-05:00', endsAt: '2027-01-28T08:30:00-05:00', location: { name: 'The Plaza' }, task: { name: 'Volunteering' } };
  const data = { shifts: [shift, { ...shift, id: 'empty' }], volunteers: [{ id: 'v', wantsSiteLead: true }], signups: [{ id: 's', shiftId: 'slot', volunteerId: 'v', volunteerName: 'Test Volunteer', email: 'test@example.test', phone: '3525550100', status: 'confirmed', trainingComplete: true }] } as AdminSnapshot;
  const rows = signupExportRows(data);
  assert.deepEqual(rows[0], EXPORT_HEADERS);
  assert.deepEqual(rows[1], ['2027-01-28', '8:00 AM', '8:30 AM', 'The Plaza', 'Volunteering', 'Test Volunteer', 'test@example.test', '3525550100', 'confirmed', 'Yes', 'Yes', 's']);
  assert.equal(rows[2][8], 'Open');
});
