import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const ACCOUNT_SESSION_SECONDS = 30 * 24 * 60 * 60;
const dummyHash = `scrypt$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(32).toString('base64url')}`;
export const accountCookieName = () => process.env.NODE_ENV === 'production' ? '__Host-sccnh_account' : 'sccnh_account';
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 32 || !/^[+\d(). -]+$/.test(value)) return null;
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 128 * 1024 * 1024 }, (error, digest) => error ? reject(error) : resolve(digest)));
}

export async function hashPhone(value: string): Promise<string> {
  const phone = normalizePhone(value);
  if (!phone) throw new Error('Enter a valid phone number.');
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${(await derive(phone, salt)).toString('base64url')}`;
}

export async function verifyPhone(value: string, stored: string | undefined): Promise<boolean> {
  const phone = normalizePhone(value);
  if (!phone) return false;
  const encoded = stored && /^scrypt\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/.test(stored) ? stored : dummyHash;
  const [, salt, digest] = encoded.split('$');
  const actual = await derive(phone, Buffer.from(salt, 'base64url'));
  return timingSafeEqual(actual, Buffer.from(digest, 'base64url')) && encoded !== dummyHash;
}

export function newAccountToken(): string { return randomBytes(32).toString('base64url'); }
export function sessionDigest(token: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid session.');
  return createHash('sha256').update(`sccnh-account-session-v1:${token}`).digest('hex');
}
