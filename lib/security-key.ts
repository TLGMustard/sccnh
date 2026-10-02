import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export function keyedDigest(scope: string, value: string, secret: string): string {
  if (secret.length < 32) throw new Error('Security keying secret must be at least 32 characters.');
  return createHmac('sha256', secret).update(`${scope}\0${value}`).digest('base64url');
}

export function requestNetworkIdentity(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  const immediate = forwarded.at(-1);
  if (immediate && isIP(immediate)) return immediate;
  const realIp = request.headers.get('x-real-ip')?.trim() ?? '';
  return isIP(realIp) ? realIp : 'unknown';
}
