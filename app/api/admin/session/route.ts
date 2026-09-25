import { NextRequest, NextResponse } from 'next/server';
import { createAdminSession } from '@/lib/admin-session';
import { adminCookieName } from '@/lib/admin-auth';
import { verifyAccessCode } from '@/lib/access-code';
import { createRateLimiter, isDeclaredJsonBodyTooLarge, parseJsonRequest, sensitiveResponseHeaders } from '@/lib/request-security';

const signInAttempts = createRateLimiter(8, 60_000);

function requestKey(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  if (isDeclaredJsonBodyTooLarge(request.headers.get('content-length'))) return NextResponse.json({ message: 'Invalid request.' }, { status: 413, headers: sensitiveResponseHeaders });
  const parsed = parseJsonRequest(request.headers.get('content-type'), await request.text());
  if (!parsed.ok) return NextResponse.json({ message: 'Invalid request.' }, { status: parsed.status, headers: sensitiveResponseHeaders });
  if (!signInAttempts.allow(requestKey(request))) return NextResponse.json({ message: 'Please wait before trying again.' }, { status: 429, headers: sensitiveResponseHeaders });
  const code = typeof parsed.value.accessCode === 'string' ? parsed.value.accessCode : '';
  const hash = process.env.ADMIN_ACCESS_CODE_HASH ?? '';
  const secret = process.env.ADMIN_SESSION_SECRET ?? '';
  if (!hash || !secret || !(await verifyAccessCode(code, hash))) return NextResponse.json({ message: 'Organizer sign-in required.' }, { status: 401, headers: sensitiveResponseHeaders });
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  const response = NextResponse.json({ ok: true }, { headers: sensitiveResponseHeaders });
  response.cookies.set(adminCookieName, createAdminSession(secret, expiresAt), { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 12 * 60 * 60 });
  return response;
}
