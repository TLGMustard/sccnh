import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 'sccnh-admin-v2';
const MAX_SESSION_MS = 4 * 60 * 60 * 1000;

export type AdminSessionClaims = { sessionId: string; issuedAt: number; expiresAt: number };

export function adminCookieName(production = process.env.NODE_ENV === 'production'): string {
  return production ? '__Host-sccnh_admin' : 'sccnh_admin';
}

export function createAdminSession(secret: string, claims: AdminSessionClaims): string {
  if (secret.length < 32) throw new Error('ADMIN_SESSION_SECRET must be at least 32 characters.');
  if (!validClaims(claims)) throw new Error('Invalid organizer session claims.');
  const payload = `${VERSION}.${claims.issuedAt}.${claims.expiresAt}.${claims.sessionId}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function readAdminSession(token: string | undefined, secret: string, now = Date.now()): AdminSessionClaims | null {
  if (!token || secret.length < 32) return null;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== VERSION) return null;
  const claims = { sessionId: parts[3], issuedAt: Number(parts[1]), expiresAt: Number(parts[2]) };
  if (!validClaims(claims) || claims.expiresAt <= now) return null;
  const payload = parts.slice(0, 4).join('.');
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(parts[4]);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return claims;
}

function validClaims(claims: AdminSessionClaims): boolean {
  return Number.isSafeInteger(claims.issuedAt) && Number.isSafeInteger(claims.expiresAt) &&
    claims.expiresAt > claims.issuedAt && claims.expiresAt - claims.issuedAt <= MAX_SESSION_MS &&
    /^[A-Za-z0-9_-]{8,128}$/.test(claims.sessionId);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
