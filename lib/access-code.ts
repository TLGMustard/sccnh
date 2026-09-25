import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
const N = 32768;
const R = 8;
const P = 3;
const DIGEST_BYTES = 32;
const MAX_MEMORY = 128 * 1024 * 1024;

export function validateAccessCode(value: string): string | null {
  const code = value.trim();
  return code.length >= 12 && code.length <= 128 ? code : null;
}

export async function hashAccessCode(codeInput: string): Promise<string> {
  const code = validateAccessCode(codeInput);
  if (!code) throw new Error('Access code must be 12 to 128 characters.');
  const salt = randomBytes(16);
  const digest = await derive(code, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${digest.toString('base64url')}`;
}

export async function verifyAccessCode(codeInput: string, encoded: string): Promise<boolean> {
  const code = validateAccessCode(codeInput);
  const parsed = parseEncodedHash(encoded);
  if (!code || !parsed) return false;
  const actual = await derive(code, parsed.salt);
  return actual.length === parsed.digest.length && timingSafeEqual(actual, parsed.digest);
}

async function derive(code: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(code, salt, DIGEST_BYTES, { N, r: R, p: P, maxmem: MAX_MEMORY }, (error, derived) => {
      if (error) reject(error);
      else resolve(Buffer.from(derived));
    });
  });
}

function parseEncodedHash(value: string): { salt: Buffer; digest: Buffer } | null {
  const parts = value.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== String(N) || parts[2] !== String(R) || parts[3] !== String(P)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(parts[4]) || !/^[A-Za-z0-9_-]+$/.test(parts[5])) return null;
  try {
    const salt = Buffer.from(parts[4], 'base64url');
    const digest = Buffer.from(parts[5], 'base64url');
    return salt.length === 16 && digest.length === DIGEST_BYTES ? { salt, digest } : null;
  } catch {
    return null;
  }
}
