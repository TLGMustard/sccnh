import { NextRequest, NextResponse } from 'next/server';
import { getApplicationOrigin } from '@/lib/app-config';
import { createEmailProof, emailProofCookieName, verificationSecret } from '@/lib/email-verification';
import { isValidEmail, normalizeEmail } from '@/lib/domain';
import { consumeRateLimit } from '@/lib/rate-limit';
import { readJsonRequest, requireSameOrigin, sensitiveResponseHeaders } from '@/lib/request-security';
import { requestNetworkIdentity } from '@/lib/security-key';
import { confirmEmailVerification, requestEmailVerification } from '@/lib/verification-repository';

export const dynamic = 'force-dynamic';

const requestMessage = 'If that address can receive mail, a code will arrive shortly.';
const failureMessage = 'We could not verify that code.';

function reply(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, { status, headers: sensitiveResponseHeaders });
}

export async function POST(request: NextRequest) {
  let appOrigin: string;
  try {
    appOrigin = getApplicationOrigin(request.nextUrl.origin);
    verificationSecret();
  } catch {
    console.error('security configuration unavailable');
    return reply({ message: 'Service configuration is unavailable.' }, 503);
  }
  if (!requireSameOrigin(request, appOrigin)) return reply({ message: 'Invalid request.' }, 403);
  const parsed = await readJsonRequest(request);
  if (!parsed.ok) return reply({ message: 'Invalid request.' }, parsed.status);
  const action = typeof parsed.value.action === 'string' ? parsed.value.action : '';
  const email = normalizeEmail(typeof parsed.value.email === 'string' ? parsed.value.email : '');
  if (!isValidEmail(email) || new TextEncoder().encode(email).byteLength > 254) return reply({ message: 'Invalid request.' }, 400);

  try {
    if (action === 'request') {
      const limits = await Promise.all([
        consumeRateLimit({ scope: 'verification-request-email', limit: 3, windowMs: 15 * 60_000 }, email),
        consumeRateLimit({ scope: 'verification-request-network', limit: 20, windowMs: 60 * 60_000 }, requestNetworkIdentity(request)),
        consumeRateLimit({ scope: 'verification-request-global', limit: 500, windowMs: 60 * 60_000 }, 'verification-send'),
      ]);
      if (limits.some((limit) => !limit.allowed)) return reply({ message: 'Please wait before trying again.' }, 429);
      await requestEmailVerification(email);
      return reply({ ok: true, message: requestMessage });
    }
    if (action === 'confirm') {
      const limit = await consumeRateLimit({ scope: 'verification-confirm-email', limit: 8, windowMs: 15 * 60_000 }, email);
      if (!limit.allowed) return reply({ message: 'Please wait before trying again.' }, 429);
      const code = typeof parsed.value.code === 'string' ? parsed.value.code : '';
      const emailKey = await confirmEmailVerification(email, code);
      if (!emailKey) return reply({ ok: false, message: failureMessage }, 401);
      const issuedAt = Date.now();
      const response = reply({ ok: true, message: 'Email verified.' });
      response.cookies.set(emailProofCookieName(), createEmailProof({ emailKey, issuedAt, expiresAt: issuedAt + 15 * 60_000 }, verificationSecret()), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 15 * 60,
      });
      return response;
    }
    return reply({ message: 'Invalid request.' }, 400);
  } catch {
    console.error('verification request failed');
    return reply({ message: action === 'request' ? requestMessage : failureMessage }, 503);
  }
}
