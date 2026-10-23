import { NextRequest, NextResponse } from 'next/server';
import { authenticateAccount, revokeAccountSession } from '@/lib/account-repository';
import { ACCOUNT_SESSION_SECONDS, accountCookieName } from '@/lib/volunteer-account';
import { getApplicationOrigin } from '@/lib/app-config';
import { consumeRateLimit } from '@/lib/rate-limit';
import { normalizeEmail } from '@/lib/domain';
import { requestNetworkIdentity } from '@/lib/security-key';
import { readJsonRequest, requireSameOrigin, sensitiveResponseHeaders } from '@/lib/request-security';

export const dynamic = 'force-dynamic';
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: sensitiveResponseHeaders });
const text = (value: unknown) => typeof value === 'string' ? value : '';

export async function POST(request: NextRequest) {
  try {
    if (!requireSameOrigin(request, getApplicationOrigin(request.nextUrl.origin))) return reply({ message: 'Invalid request.' }, 403);
    const parsed = await readJsonRequest(request);
    if (!parsed.ok) return reply({ message: 'Invalid request.' }, parsed.status);
    const body = parsed.value;
    if (body.action === 'sign-out') {
      await revokeAccountSession(request.cookies.get(accountCookieName())?.value);
      const response = reply({ ok: true });
      response.cookies.set(accountCookieName(), '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
      return response;
    }
    if (body.action !== 'sign-in') return reply({ message: 'Invalid request.' }, 400);
    const limits = await Promise.all([
      consumeRateLimit({ scope: 'volunteer-sign-in-email', limit: 8, windowMs: 15 * 60_000 }, normalizeEmail(text(body.email)).slice(0, 254)),
      consumeRateLimit({ scope: 'volunteer-sign-in-network', limit: 600, windowMs: 15 * 60_000 }, requestNetworkIdentity(request)),
    ]);
    if (limits.some((limit) => !limit.allowed)) return reply({ message: 'Please wait before trying again.' }, 429);
    const result = await authenticateAccount(text(body.email), text(body.phone));
    if (!result) return reply({ message: 'Email and phone number could not be verified. Use the details from your signup.' }, 401);
    await revokeAccountSession(request.cookies.get(accountCookieName())?.value);
    const response = reply({ ok: true });
    response.cookies.set(accountCookieName(), result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: ACCOUNT_SESSION_SECONDS });
    return response;
  } catch {
    console.error('volunteer sign-in failed');
    return reply({ message: 'Sign-in is temporarily unavailable. Please try again.' }, 503);
  }
}
