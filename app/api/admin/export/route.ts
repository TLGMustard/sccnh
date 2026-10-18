import { NextRequest, NextResponse } from 'next/server';
import { organizerSession } from '@/lib/admin-auth';
import { getApplicationOrigin } from '@/lib/app-config';
import { getAdminSnapshot } from '@/lib/repository';
import { exportToGoogleSheets, signupCsv } from '@/lib/google-sheets-export';
import { requireSameOrigin, sensitiveResponseHeaders } from '@/lib/request-security';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!await organizerSession()) return NextResponse.json({ message: 'Organizer sign-in required.' }, { status: 401, headers: sensitiveResponseHeaders });
  try {
    return new NextResponse(signupCsv(await getAdminSnapshot()), {
      headers: { ...sensitiveResponseHeaders, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="sccnh-shift-signups.csv"' },
    });
  } catch { return NextResponse.json({ message: 'Export unavailable.' }, { status: 503, headers: sensitiveResponseHeaders }); }
}

export async function POST(request: NextRequest) {
  try {
    const origin = getApplicationOrigin(request.nextUrl.origin);
    if (!requireSameOrigin(request, origin)) return NextResponse.json({ message: 'Invalid request.' }, { status: 403, headers: sensitiveResponseHeaders });
    if (!await organizerSession()) return NextResponse.json({ message: 'Organizer sign-in required.' }, { status: 401, headers: sensitiveResponseHeaders });
    const count = await exportToGoogleSheets(await getAdminSnapshot());
    return NextResponse.json({ ok: true, count }, { headers: sensitiveResponseHeaders });
  } catch (error) {
    console.error('Google Sheets export failed');
    return NextResponse.json({ message: error instanceof Error && error.message === 'Google Sheets export is not configured.' ? error.message : 'Google Sheets export failed. Check the destination tab and service account permissions.' }, { status: 503, headers: sensitiveResponseHeaders });
  }
}
