import assert from 'node:assert/strict';
import test from 'node:test';

type Receipt = { email: string; firstName: string; shifts: Array<{ date: string; startsAt: string; endsAt: string; location: string; role: string }> };
type Create = (profile: { email: string; firstName: string }, shifts: Array<Record<string, string>>) => Receipt;

async function create(): Promise<Create> {
  const loaded = await import('./signup-receipt.ts').catch(() => ({
    createSignupReceipt: () => ({ email: '', firstName: '', shifts: [] }),
  }));
  return loaded.createSignupReceipt as Create;
}

void test('builds one minimal, chronological receipt for a multi-shift signup', async () => {
  const receipt = (await create())(
    { email: 'ana@example.edu', firstName: 'Ana' },
    [
      { day: '2027-01-28', startsAt: '2027-01-28T10:00:00-05:00', endsAt: '2027-01-28T10:30:00-05:00', locationName: 'Plaza of the Americas', taskName: 'Volunteering', phone: 'must-not-export' },
      { day: '2027-01-27', startsAt: '2027-01-27T18:00:00-05:00', endsAt: '2027-01-27T19:00:00-05:00', locationName: 'UF Hillel', taskName: 'Pre-packaging', phone: 'must-not-export' },
    ],
  );
  assert.deepEqual(receipt, {
    email: 'ana@example.edu',
    firstName: 'Ana',
    shifts: [
      { date: '2027-01-27', startsAt: '2027-01-27T18:00:00-05:00', endsAt: '2027-01-27T19:00:00-05:00', location: 'UF Hillel', role: 'Pre-packaging' },
      { date: '2027-01-28', startsAt: '2027-01-28T10:00:00-05:00', endsAt: '2027-01-28T10:30:00-05:00', location: 'Plaza of the Americas', role: 'Volunteering' },
    ],
  });
});
