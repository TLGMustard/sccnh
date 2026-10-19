import { NextRequest, NextResponse } from 'next/server';
import { organizerSession } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/admin-audit';
import { getAdminSnapshot } from '@/lib/repository';
import { exportCsv, signupExportRows } from '@/lib/signup-export';
import { exportToGoogleSheets, sheetsConfig } from '@/lib/google-sheets';
import { getApplicationOrigin } from '@/lib/app-config';
import { consumeRateLimit } from '@/lib/rate-limit';
import { readJsonRequest, requireSameOrigin, sensitiveResponseHeaders } from '@/lib/request-security';

export const dynamic = 'force-dynamic';
const reply = (value: unknown, status: number) => NextResponse.json(value, { status, headers: sensitiveResponseHeaders });

export async function GET() {
  const session = await organizerSession();
  if (!session) return reply({ message: 'Organizer sign-in required.' }, 401);
  try {
    const limit = await consumeRateLimit({ scope: 'export-csv', limit: 10, windowMs: 60000 }, session.sessionId);
    if (!limit.allowed) return reply({ message: 'Please wait before exporting again.' }, 429);
    const rows = signupExportRows(await getAdminSnapshot());
    await recordAdminAudit({ action: 'export-csv', targetType: 'session', targetId: 'signup-roster', outcome: 'success', actorIdentifier: `session:${session.sessionId}` });
    return new NextResponse(exportCsv(rows), { headers: { ...sensitiveResponseHeaders, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="sccnh-signups.csv"' } });
  } catch { console.error('roster export failed'); return reply({ message: 'The roster could not be exported.' }, 503); }
}

export async function POST(request: NextRequest) {
  const session = await organizerSession();
  if (!session) return reply({ message: 'Organizer sign-in required.' }, 401);
  try {
    if (!requireSameOrigin(request, getApplicationOrigin(request.nextUrl.origin))) return reply({ message: 'Invalid request.' }, 403);
    const parsed = await readJsonRequest(request);
    if (!parsed.ok) return reply({ message: 'Invalid request.' }, parsed.status);
    const config = sheetsConfig();
    if (!config) return reply({ message: 'Google Sheets needs a destination spreadsheet and service account in Railway. Download CSV for Excel or Sheets in the meantime.' }, 503);
    const limit = await consumeRateLimit({ scope: 'export-sheets', limit: 5, windowMs: 60000 }, session.sessionId);
    if (!limit.allowed) return reply({ message: 'Please wait before exporting again.' }, 429);
    const rows = signupExportRows(await getAdminSnapshot());
    // Record the attempt before disclosing contact details to the authorized destination.
    await recordAdminAudit({ action: 'export-sheets', targetType: 'session', targetId: 'signup-roster', outcome: 'started', actorIdentifier: `session:${session.sessionId}` });
    const url = await exportToGoogleSheets(rows, config);
    await recordAdminAudit({ action: 'export-sheets', targetType: 'session', targetId: 'signup-roster', outcome: 'success', actorIdentifier: `session:${session.sessionId}` });
    return reply({ ok: true, url, message: 'Roster exported to Google Sheets.' }, 200);
  } catch { console.error('sheets export failed'); return reply({ message: 'Google Sheets export failed. Check the service account and spreadsheet sharing. CSV download is still available.' }, 503); }
}
