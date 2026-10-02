import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { adminCookieName, createAdminSession } from '@/lib/admin-session';
import { verifyStoredAccessCode } from '@/lib/access-code';
import { readJsonRequest, requireSameOrigin, sensitiveResponseHeaders } from '@/lib/request-security';
import { getApplicationOrigin } from '@/lib/app-config';
import { consumeRateLimit } from '@/lib/rate-limit';
import { requestNetworkIdentity } from '@/lib/security-key';

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
  try {
    const [network, global] = await Promise.all([
      consumeRateLimit({ scope: 'admin-login-network', limit: 8, windowMs: 15 * 60_000 }, requestNetworkIdentity(request)),
      consumeRateLimit({ scope: 'admin-login-global', limit: 60, windowMs: 15 * 60_000 }, 'organizer-login'),
    ]);
    if (!network.allowed || !global.allowed) return NextResponse.json({ message: 'Please wait before trying again.' }, { status: 429, headers: sensitiveResponseHeaders });
  } catch {
    console.error('security configuration unavailable');
    return NextResponse.json({ message: 'Service configuration is unavailable.' }, { status: 503, headers: sensitiveResponseHeaders });
  }
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
