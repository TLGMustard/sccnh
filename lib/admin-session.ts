import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 'sccnh-admin-v1';

export function createAdminSession(secret: string, expiresAt: number): string {
  const payload = `${VERSION}.${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function readAdminSession(token: string | undefined, secret: string, now = Date.now()): boolean {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload, secret);
  const actualBytes = Buffer.from(parts[2]);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
