import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { adminCookieName, createAdminSession } from '@/lib/admin-session';
import { verifyStoredAccessCode } from '@/lib/access-code';
import { createRateLimiter, readJsonRequest, requireSameOrigin, sensitiveResponseHeaders } from '@/lib/request-security';
import { getApplicationOrigin } from '@/lib/app-config';

const signInAttempts = createRateLimiter(8, 60_000);

function requestKey(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  let appOrigin: string;
  try {
    appOrigin = getApplicationOrigin(request.nextUrl.origin);
  } catch (error) {
    console.error('security configuration unavailable', error instanceof Error ? error.message : 'Invalid application origin');
    return NextResponse.json({ message: 'Service configuration is unavailable.' }, { status: 503, headers: sensitiveResponseHeaders });
  }
  if (!requireSameOrigin(request, appOrigin)) return NextResponse.json({ message: 'Invalid request.' }, { status: 403, headers: sensitiveResponseHeaders });
  const parsed = await readJsonRequest(request);
  if (!parsed.ok) return NextResponse.json({ message: 'Invalid request.' }, { status: parsed.status, headers: sensitiveResponseHeaders });
  if (!signInAttempts.allow(requestKey(request))) return NextResponse.json({ message: 'Please wait before trying again.' }, { status: 429, headers: sensitiveResponseHeaders });
  const code = typeof parsed.value.accessCode === 'string' ? parsed.value.accessCode : '';
  const hash = process.env.ADMIN_ACCESS_CODE_HASH ?? '';
  const secret = process.env.ADMIN_SESSION_SECRET ?? '';
  if (!hash || secret.length < 32 || !(await verifyStoredAccessCode(code, hash))) return NextResponse.json({ message: 'Organizer sign-in required.' }, { status: 401, headers: sensitiveResponseHeaders });
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 4 * 60 * 60 * 1000;
  const response = NextResponse.json({ ok: true }, { headers: sensitiveResponseHeaders });
  response.cookies.set(adminCookieName(), createAdminSession(secret, { sessionId: randomBytes(18).toString('base64url'), issuedAt, expiresAt }), { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 4 * 60 * 60 });
  return response;
}

export async function DELETE(request: NextRequest) {
  let appOrigin: string;
  try {
    appOrigin = getApplicationOrigin(request.nextUrl.origin);
  } catch (error) {
    console.error('security configuration unavailable', error instanceof Error ? error.message : 'Invalid application origin');
    return NextResponse.json({ message: 'Service configuration is unavailable.' }, { status: 503, headers: sensitiveResponseHeaders });
  }
  if (!requireSameOrigin(request, appOrigin)) return NextResponse.json({ message: 'Invalid request.' }, { status: 403, headers: sensitiveResponseHeaders });
  const response = NextResponse.json({ ok: true }, { headers: sensitiveResponseHeaders });
  response.cookies.set(adminCookieName(), '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return response;
}
