import { randomInt, sign } from 'node:crypto';

type SheetsConfig = { spreadsheetId: string; clientEmail: string; privateKey: string };
const TITLE = 'SCCNH Signups';

export function sheetsConfig(): SheetsConfig | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? '';
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL ?? '';
  const privateKey = (process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? '').replaceAll('\\n', '\n');
  return /^[A-Za-z0-9_-]{10,150}$/.test(spreadsheetId) && clientEmail.endsWith('.iam.gserviceaccount.com') && privateKey.includes('BEGIN PRIVATE KEY') ? { spreadsheetId, clientEmail, privateKey } : null;
}

export function sheetsUpdateRequests(sheetId: number, rows: string[][], addSheet = false, existingGrid?: { rowCount: number; columnCount: number }): object[] {
  const rowCount = Math.max(1000, rows.length, existingGrid?.rowCount ?? 0);
  const columnCount = Math.max(26, existingGrid?.columnCount ?? 0);
  return [
    ...(addSheet ? [{ addSheet: { properties: { sheetId, title: TITLE, gridProperties: { rowCount, columnCount } } } }] : [{ updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount, columnCount } }, fields: 'gridProperties.rowCount,gridProperties.columnCount' } }]),
    // A whole-sheet range clears stale values beyond the new data. Literal stringValue
    // keeps user input as text, including names or phones beginning with = or +.
    { updateCells: { range: { sheetId }, rows: rows.map((row) => ({ values: row.map((value) => ({ userEnteredValue: { stringValue: value } })) })), fields: 'userEnteredValue' } },
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
  ];
}

export async function exportToGoogleSheets(rows: string[][], config: SheetsConfig, request: typeof fetch = fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: config.clientEmail, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const assertion = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), config.privateKey).toString('base64url')}`;
  const tokenResponse = await request('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  if (!tokenResponse.ok) throw new Error('Sheets authentication failed.');
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new Error('Sheets authentication failed.');
  const headers = { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}`;
  const metadata = await request(`${base}?fields=sheets.properties`, { headers, signal: AbortSignal.timeout(15000) });
  if (!metadata.ok) throw new Error('Sheets destination unavailable.');
  const book = await metadata.json() as { sheets?: { properties: { sheetId: number; title: string; gridProperties?: { rowCount: number; columnCount: number } } }[] };
  const existing = book.sheets?.find((sheet) => sheet.properties.title === TITLE);
  let sheetId = existing?.properties.sheetId ?? randomInt(1, 2147483647);
  while (!existing && book.sheets?.some((sheet) => sheet.properties.sheetId === sheetId)) sheetId = randomInt(1, 2147483647);
  const result = await request(`${base}:batchUpdate`, { method: 'POST', headers, signal: AbortSignal.timeout(20000), body: JSON.stringify({ requests: sheetsUpdateRequests(sheetId, rows, !existing, existing?.properties.gridProperties) }) });
  if (!result.ok) throw new Error('Sheets update failed.');
  return `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit#gid=${sheetId}`;
}
