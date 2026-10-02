import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminCookieName, createAdminSession, readAdminSession } from '@/lib/admin-session';
import { verifyStoredAccessCode } from '@/lib/access-code';
import { recordAdminAudit, type AdminAuditOutcome } from '@/lib/admin-audit';
import { readJsonRequest, requireSameOrigin, sensitiveResponseHeaders } from '@/lib/request-security';
import { getApplicationOrigin } from '@/lib/app-config';
import { consumeRateLimit } from '@/lib/rate-limit';
import { requestNetworkIdentity } from '@/lib/security-key';

function reply(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, { status, headers: sensitiveResponseHeaders });
}

async function auditLogin(outcome: AdminAuditOutcome, actorIdentifier: string): Promise<boolean> {
  try {
    await recordAdminAudit({ action: 'login', targetType: 'session', targetId: 'organizer', outcome, actorIdentifier });
    return true;
  } catch {
    console.error('admin audit write failed');
    return false;
  }
}

function clearAdminCookie(response: NextResponse): NextResponse {
  response.cookies.set(adminCookieName(), '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return response;
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
  const actorIdentifier = `network:${requestNetworkIdentity(request)}`;
  try {
    const [network, global] = await Promise.all([
      consumeRateLimit({ scope: 'admin-login-network', limit: 8, windowMs: 15 * 60_000 }, requestNetworkIdentity(request)),
      consumeRateLimit({ scope: 'admin-login-global', limit: 60, windowMs: 15 * 60_000 }, 'organizer-login'),
    ]);
    if (!network.allowed || !global.allowed) {
      if (!(await auditLogin('rejected', actorIdentifier))) return reply({ message: 'Service configuration is unavailable.' }, 503);
      return reply({ message: 'Please wait before trying again.' }, 429);
    }
  } catch {
    console.error('security configuration unavailable');
    return reply({ message: 'Service configuration is unavailable.' }, 503);
  }
  const code = typeof parsed.value.accessCode === 'string' ? parsed.value.accessCode : '';
  const hash = process.env.ADMIN_ACCESS_CODE_HASH ?? '';
  const secret = process.env.ADMIN_SESSION_SECRET ?? '';
  if (!hash || secret.length < 32 || !(await verifyStoredAccessCode(code, hash))) {
    if (!(await auditLogin('denied', actorIdentifier))) return reply({ message: 'Service configuration is unavailable.' }, 503);
    return reply({ message: 'Organizer sign-in required.' }, 401);
  }
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 4 * 60 * 60 * 1000;
  const sessionId = randomUUID().replaceAll('-', '');
  if (!(await auditLogin('success', `session:${sessionId}`))) return reply({ message: 'Service configuration is unavailable.' }, 503);
  const response = reply({ ok: true });
  response.cookies.set(adminCookieName(), createAdminSession(secret, { sessionId, issuedAt, expiresAt }), { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 4 * 60 * 60 });
  return response;
}

export async function DELETE(request: NextRequest) {
  let appOrigin: string;
  try {
    appOrigin = getApplicationOrigin(request.nextUrl.origin);
  } catch (error) {
    console.error('security configuration unavailable', error instanceof Error ? error.message : 'Invalid application origin');
    return clearAdminCookie(reply({ message: 'Service configuration is unavailable.' }, 503));
  }
  if (!requireSameOrigin(request, appOrigin)) return reply({ message: 'Invalid request.' }, 403);
  const secret = process.env.ADMIN_SESSION_SECRET ?? '';
  const claims = readAdminSession(request.cookies.get(adminCookieName())?.value, secret);
  const actorIdentifier = claims ? `session:${claims.sessionId}` : `network:${requestNetworkIdentity(request)}`;
  try {
    await recordAdminAudit({ action: 'logout', targetType: 'session', targetId: 'organizer', outcome: 'success', actorIdentifier });
    return clearAdminCookie(reply({ ok: true }));
  } catch {
    console.error('admin audit write failed');
    return clearAdminCookie(reply({ message: 'Service configuration is unavailable.' }, 503));
  }
}
