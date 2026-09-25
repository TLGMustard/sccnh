import { NextRequest, NextResponse } from 'next/server';
import { cancelSignup, claimShift, getPublicSnapshot, getVolunteerDashboard } from '@/lib/repository';
import { createRateLimiter, isDeclaredJsonBodyTooLarge, parseJsonRequest, sensitiveResponseHeaders } from '@/lib/request-security';

export const dynamic = 'force-dynamic';

function textValue(value: unknown): string { return typeof value === 'string' ? value : ''; }
function reply(value: unknown, status = 200): NextResponse { return NextResponse.json(value, { status, headers: sensitiveResponseHeaders }); }
const accessAttempts = createRateLimiter(8, 60_000);

function requestKey(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function GET() {
  try {
    return reply(await getPublicSnapshot());
  } catch (error) {
    console.error('public schedule read failed', error);
    return reply({ message: 'Schedule data is unavailable.' }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (isDeclaredJsonBodyTooLarge(request.headers.get('content-length'))) return reply({ message: 'Invalid request.' }, 413);
  const parsed = parseJsonRequest(request.headers.get('content-type'), await request.text());
  if (!parsed.ok) return reply({ message: 'Invalid request.' }, parsed.status);
  try {
    const body = parsed.value;
    if ((body.action === 'claim' || body.action === 'mine' || body.action === 'cancel') && !accessAttempts.allow(requestKey(request))) {
      return reply({ message: 'Please wait before trying again.' }, 429);
    }
    if (body.action === 'claim') {
      const result = await claimShift({ shiftId: textValue(body.shiftId), firstName: textValue(body.firstName), lastName: textValue(body.lastName), email: textValue(body.email), phone: textValue(body.phone), wantsSiteLead: body.wantsSiteLead === true, accessCode: textValue(body.accessCode) });
      return reply(result, result.ok ? 200 : 409);
    }
    if (body.action === 'mine') {
      const dashboard = await getVolunteerDashboard(textValue(body.email), textValue(body.accessCode));
      return dashboard ? reply({ dashboard }) : reply({ message: 'No matching volunteer record.' }, 404);
    }
    if (body.action === 'cancel') {
      const result = await cancelSignup(textValue(body.signupId), textValue(body.email), textValue(body.accessCode));
      return reply(result, result.ok ? 200 : 404);
    }
    return reply({ message: 'Invalid request.' }, 400);
  } catch (error) {
    console.error('volunteer action failed', error);
    return reply({ message: 'We could not save that change.' }, 503);
  }
}
