import { createSign } from 'node:crypto';
import { formatDay, formatTimeRange } from './domain.ts';
import type { AdminSnapshot } from './repository.ts';

export function signupRows(snapshot: AdminSnapshot): string[][] {
  const shifts = new Map(snapshot.shifts.map((shift) => [shift.id, shift]));
  return [
    ['Date', 'Time', 'Location', 'Role', 'Volunteer', 'Personal email', 'Phone', 'Status', 'Training complete', 'Shift ID'],
    ...snapshot.signups.map((signup) => {
      const shift = shifts.get(signup.shiftId);
      return [formatDay(signup.startsAt.slice(0, 10)), shift ? formatTimeRange(shift.startsAt, shift.endsAt) : signup.startsAt,
        signup.locationName, signup.taskName, signup.volunteerName, signup.email, signup.phone,
        signup.status, signup.trainingComplete ? 'Yes' : 'No', signup.shiftId];
    }),
  ];
}

export function signupCsv(snapshot: AdminSnapshot): string {
  // Prevent spreadsheet formula evaluation of untrusted volunteer fields.
  return signupRows(snapshot).map((row) => row.map((cell) => {
    const safe = /^[\s]*[=+@-]/.test(cell) ? `'${cell}` : cell;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n') + '\r\n';
}

export async function exportToGoogleSheets(snapshot: AdminSnapshot): Promise<number> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const tab = process.env.GOOGLE_SHEETS_TAB_NAME ?? 'Signups';
  if (!spreadsheetId || !rawCredentials) throw new Error('Google Sheets export is not configured.');
  const credentials = JSON.parse(rawCredentials) as { client_email?: string; private_key?: string };
  if (!credentials.client_email || !credentials.private_key) throw new Error('Invalid Google service account credentials.');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: credentials.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const assertion = `${unsigned}.${Buffer.from(signer.sign(credentials.private_key)).toString('base64url')}`;
  const auth = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!auth.ok) throw new Error('Google Sheets authentication failed.');
  const { access_token } = await auth.json() as { access_token: string };
  const range = encodeURIComponent(`'${tab.replaceAll("'", "''")}'!A:J`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}`;
  const headers = { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' };
  const existing = await fetch(`${url}?fields=values`, { headers, signal: AbortSignal.timeout(10_000) });
  if (!existing.ok) throw new Error('Could not read the destination tab. Check its name and sharing permissions.');
  const prior = await existing.json() as { values?: unknown[] };
  const rows = signupRows(snapshot);
  const updated = await fetch(`${url}?valueInputOption=RAW`, { method: 'PUT', headers, body: JSON.stringify({ majorDimension: 'ROWS', values: rows }), signal: AbortSignal.timeout(10_000) });
  if (!updated.ok) throw new Error('Could not write the new rows to Google Sheets.');
  const oldLength = prior.values?.length ?? 0;
  if (oldLength > rows.length) {
    const staleRange = encodeURIComponent(`'${tab.replaceAll("'", "''")}'!A${rows.length + 1}:J${oldLength}`);
    const cleared = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${staleRange}:clear`, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(10_000) });
    if (!cleared.ok) throw new Error('New rows were written, but stale rows could not be cleared. Retry the export.');
  }
  return rows.length - 1;
}
