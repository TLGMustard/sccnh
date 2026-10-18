import { NextRequest, NextResponse } from 'next/server';
import { cancelSignup, changeSignup, claimShift, getPublicSnapshot, getVolunteerDashboard } from '@/lib/repository';
import { attemptShiftConfirmation, buildShiftConfirmation, sendShiftConfirmation } from '@/lib/confirmation-email';
import { readJsonRequest, requireSameOrigin, sensitiveResponseHeaders } from '@/lib/request-security';
import { getApplicationOrigin } from '@/lib/app-config';
import { boundedIdentifier } from '@/lib/signup-profile';
import { normalizeEmail } from '@/lib/domain';
import { consumeRateLimit, type RateLimitPolicy } from '@/lib/rate-limit';
import { emailProofCookieName, readEmailProof, verificationSecret } from '@/lib/email-verification';
import { keyedDigest } from '@/lib/security-key';
import { isValidEmail } from '@/lib/domain';

export const dynamic = 'force-dynamic';

function textValue(value: unknown): string { return typeof value === 'string' ? value : ''; }
function reply(value: unknown, status = 200): NextResponse { return NextResponse.json(value, { status, headers: sensitiveResponseHeaders }); }
const volunteerPolicies: Record<string, RateLimitPolicy> = {
  claim: { scope: 'claim', limit: 12, windowMs: 15 * 60_000 },
  mine: { scope: 'mine', limit: 8, windowMs: 15 * 60_000 },
  cancel: { scope: 'cancel', limit: 8, windowMs: 15 * 60_000 },
  change: { scope: 'change', limit: 8, windowMs: 15 * 60_000 },
};

export async function GET() {
  try {
    return reply(await getPublicSnapshot());
  } catch {
    console.error('public schedule read failed');
    return reply({ message: 'Schedule data is unavailable.' }, 503);
  }
}

export async function POST(request: NextRequest) {
  let appOrigin: string;
  try {
    appOrigin = getApplicationOrigin(request.nextUrl.origin);
  } catch {
    console.error('security configuration unavailable');
    return reply({ message: 'Service configuration is unavailable.' }, 503);
  }
  if (!requireSameOrigin(request, appOrigin)) return reply({ message: 'Invalid request.' }, 403);
  const parsed = await readJsonRequest(request);
  if (!parsed.ok) return reply({ message: 'Invalid request.' }, parsed.status);
  try {
    const body = parsed.value;
    const action = typeof body.action === 'string' ? body.action : '';
    const policy = volunteerPolicies[action];
    if (policy) {
      try {
        const limit = await consumeRateLimit(policy, normalizeEmail(textValue(body.email)) || 'invalid-email');
        if (!limit.allowed) return reply({ message: 'Please wait before trying again.' }, 429);
      } catch {
        console.error('security configuration unavailable');
        return reply({ message: 'Service configuration is unavailable.' }, 503);
      }
    }
    if (policy) {
      const email = normalizeEmail(textValue(body.email));
      if (!isValidEmail(email) || new TextEncoder().encode(email).byteLength > 254) return reply({ message: 'Invalid request.' }, 400);
      try {
        const secret = verificationSecret();
        const emailKey = keyedDigest('email-verification', email, secret);
        if (!readEmailProof(request.cookies.get(emailProofCookieName())?.value, emailKey, secret)) {
          return reply({ ok: false, code: 'email_verification_required', message: 'Verify your email to manage shifts.' }, 403);
        }
      } catch {
        return reply({ message: 'Service configuration is unavailable.' }, 503);
      }
    }
    if (body.action === 'claim') {
      const shiftId = boundedIdentifier(body.shiftId) ?? '';
      const email = normalizeEmail(textValue(body.email));
      const result = await claimShift({ shiftId, firstName: textValue(body.firstName), lastName: textValue(body.lastName), email, phone: textValue(body.phone), wantsSiteLead: body.wantsSiteLead === true });
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
      const dashboard = await getVolunteerDashboard(textValue(body.email));
      return dashboard ? reply({ dashboard }) : reply({ message: 'No matching volunteer record.' }, 404);
    }
    if (body.action === 'cancel') {
      const result = await cancelSignup(boundedIdentifier(body.signupId) ?? '', textValue(body.email));
      return reply(result, result.ok ? 200 : 404);
    }
    if (body.action === 'change') {
      const result = await changeSignup({ signupId: boundedIdentifier(body.signupId) ?? '', targetShiftId: boundedIdentifier(body.targetShiftId) ?? '', email: textValue(body.email) });
      return reply(result, result.ok ? 200 : 409);
    }
    return reply({ message: 'Invalid request.' }, 400);
  } catch {
    console.error('volunteer action failed');
    return reply({ message: 'We could not save that change.' }, 503);
  }
}
