import { NextRequest, NextResponse } from 'next/server';
import { cancelSignup, changeSignup, claimShift, getPublicSnapshot, getVolunteerDashboard } from '@/lib/repository';
import { attemptShiftConfirmation, buildShiftConfirmation, sendShiftConfirmation } from '@/lib/confirmation-email';
import { createRateLimiter, readJsonRequest, requireSameOrigin, sensitiveResponseHeaders } from '@/lib/request-security';
import { getApplicationOrigin } from '@/lib/app-config';
import { boundedIdentifier } from '@/lib/signup-profile';

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
  let appOrigin: string;
  try {
    appOrigin = getApplicationOrigin(request.nextUrl.origin);
  } catch (error) {
    console.error('security configuration unavailable', error instanceof Error ? error.message : 'Invalid application origin');
    return reply({ message: 'Service configuration is unavailable.' }, 503);
  }
  if (!requireSameOrigin(request, appOrigin)) return reply({ message: 'Invalid request.' }, 403);
  const parsed = await readJsonRequest(request);
  if (!parsed.ok) return reply({ message: 'Invalid request.' }, parsed.status);
  try {
    const body = parsed.value;
    if ((body.action === 'claim' || body.action === 'mine' || body.action === 'cancel' || body.action === 'change') && !accessAttempts.allow(requestKey(request))) {
      return reply({ message: 'Please wait before trying again.' }, 429);
    }
    if (body.action === 'claim') {
      const shiftId = boundedIdentifier(body.shiftId) ?? '';
      const result = await claimShift({ shiftId, firstName: textValue(body.firstName), lastName: textValue(body.lastName), email: textValue(body.email), phone: textValue(body.phone), wantsSiteLead: body.wantsSiteLead === true, accessCode: textValue(body.accessCode) });
      if (!result.ok) return reply(result, 409);
      const claimed = result.dashboard.shifts.find((shift) => shift.id === shiftId);
      const delivered = Boolean(claimed) && await attemptShiftConfirmation(async () => {
        const message = buildShiftConfirmation({
          to: result.dashboard.volunteer.email,
          firstName: result.dashboard.volunteer.firstName,
          location: claimed!.location.name,
          startsAt: claimed!.startsAt,
          endsAt: claimed!.endsAt,
          appBaseUrl: appOrigin,
        });
        await sendShiftConfirmation(message);
      });
      return reply({ ...result, receipt: delivered ? 'sent' : 'failed' });
    }
    if (body.action === 'mine') {
      const dashboard = await getVolunteerDashboard(textValue(body.email), textValue(body.accessCode));
      return dashboard ? reply({ dashboard }) : reply({ message: 'No matching volunteer record.' }, 404);
    }
    if (body.action === 'cancel') {
      const result = await cancelSignup(boundedIdentifier(body.signupId) ?? '', textValue(body.email), textValue(body.accessCode));
      return reply(result, result.ok ? 200 : 404);
    }
    if (body.action === 'change') {
      const result = await changeSignup({ signupId: boundedIdentifier(body.signupId) ?? '', targetShiftId: boundedIdentifier(body.targetShiftId) ?? '', email: textValue(body.email), accessCode: textValue(body.accessCode) });
      return reply(result, result.ok ? 200 : 409);
    }
    return reply({ message: 'Invalid request.' }, 400);
  } catch (error) {
    console.error('volunteer action failed', error);
    return reply({ message: 'We could not save that change.' }, 503);
  }
}
