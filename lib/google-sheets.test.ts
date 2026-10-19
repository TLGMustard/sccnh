import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { exportToGoogleSheets, sheetsUpdateRequests } from './google-sheets.ts';

void test('Sheets export writes formulas as literal text and clears stale rows atomically', () => {
  const requests = sheetsUpdateRequests(5, [['Name'], ['=HYPERLINK("x")']]);
  const update = requests[1] as { updateCells: { range: object; rows: { values: { userEnteredValue: object }[] }[] } };
  assert.deepEqual(update.updateCells.range, { sheetId: 5 });
  assert.deepEqual(update.updateCells.rows[1].values[0].userEnteredValue, { stringValue: '=HYPERLINK("x")' });
  assert.equal('addSheet' in requests[0], false);
  assert.equal('addSheet' in sheetsUpdateRequests(7, [['a']], true)[0], true);
  const expanded = sheetsUpdateRequests(5, [['x']], false, { rowCount: 5000, columnCount: 30 })[0] as { updateSheetProperties: { properties: { gridProperties: object } } };
  assert.deepEqual(expanded.updateSheetProperties.properties.gridProperties, { rowCount: 5000, columnCount: 30 });
});

void test('Sheets client authenticates and updates only its dedicated tab', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const calls: { url: string; init?: RequestInit }[] = [];
  const request = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (calls.length === 1) return Response.json({ access_token: 'test-token' });
    if (calls.length === 2) return Response.json({ sheets: [{ properties: { sheetId: 42, title: 'SCCNH Signups' } }, { properties: { sheetId: 9, title: 'Keep me' } }] });
    return Response.json({});
  }) as typeof fetch;
  const url = await exportToGoogleSheets([['Name'], ['Test']], { spreadsheetId: 'example-spreadsheet', clientEmail: 'test@example.iam.gserviceaccount.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }, request);
  assert.equal(calls.length, 3);
  assert.ok(calls[0].init);
  assert.equal((calls[0].init.body as URLSearchParams).get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assert.ok(url.endsWith('#gid=42'));
  const payload = JSON.parse(calls[2].init?.body as string);
  assert.equal(payload.requests[1].updateCells.range.sheetId, 42);
  assert.equal(JSON.stringify(payload).includes('Keep me'), false);
});
