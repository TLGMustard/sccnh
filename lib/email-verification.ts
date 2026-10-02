import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

const PROOF_VERSION = 'sccnh-email-v1';
const PROOF_MAX_MS = 15 * 60_000;

export type EmailProofClaims = { emailKey: string; issuedAt: number; expiresAt: number };
export type VerificationAttemptState = { attempts: number; consumedAt: number | null; expiresAt: number };
export type VerificationAttemptDecision = { allowed: boolean; attempts: number; consume: boolean };

export function emailProofCookieName(production = process.env.NODE_ENV === 'production'): string {
  return production ? '__Host-sccnh_email_verified' : 'sccnh_email_verified';
}

export function emailVerificationRequired(): boolean {
  return process.env.EMAIL_VERIFICATION_REQUIRED === 'true';
}

export function verificationSecret(): string {
  const secret = process.env.EMAIL_VERIFICATION_SECRET ?? '';
  validateSecret(secret);
  return secret;
}

export function createVerificationCode(random = () => randomInt(0, 1_000_000)): string {
  const value = random();
  if (!Number.isInteger(value) || value < 0 || value >= 1_000_000) throw new Error('Invalid verification code source.');
  return String(value).padStart(6, '0');
}

export function digestVerificationCode(requestId: string, code: string, secret: string): string {
  validateSecret(secret);
  return createHmac('sha256', secret).update(`verification-code\0${requestId}\0${code}`).digest('base64url');
}

export function verifyVerificationCode(requestId: string, code: string, digest: string, secret: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    return safeEqual(digestVerificationCode(requestId, code, secret), digest);
  } catch {
    return false;
  }
}

export function verificationAttemptDecision(state: VerificationAttemptState, matched: boolean, now = Date.now()): VerificationAttemptDecision {
  if (state.consumedAt !== null || state.expiresAt <= now || state.attempts >= 6) {
    return { allowed: false, attempts: state.attempts, consume: false };
  }
  const attempts = state.attempts + 1;
  return { allowed: matched, attempts, consume: matched };
}

export function createEmailProof(claims: EmailProofClaims, secret: string): string {
  validateSecret(secret);
  if (!validProofClaims(claims)) throw new Error('Invalid email proof claims.');
  const payload = `${PROOF_VERSION}.${claims.issuedAt}.${claims.expiresAt}.${claims.emailKey}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function readEmailProof(token: string | undefined, expectedEmailKey: string, secret: string, now = Date.now()): EmailProofClaims | null {
  if (!token || secret.length < 32) return null;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== PROOF_VERSION) return null;
  const claims = { issuedAt: Number(parts[1]), expiresAt: Number(parts[2]), emailKey: parts[3] };
  if (!validProofClaims(claims) || claims.expiresAt <= now || !safeEqual(claims.emailKey, expectedEmailKey)) return null;
  const payload = parts.slice(0, 4).join('.');
  return safeEqual(sign(payload, secret), parts[4]) ? claims : null;
}

function validProofClaims(claims: EmailProofClaims): boolean {
  return Number.isSafeInteger(claims.issuedAt) && Number.isSafeInteger(claims.expiresAt) &&
    claims.expiresAt > claims.issuedAt && claims.expiresAt - claims.issuedAt <= PROOF_MAX_MS &&
    /^[A-Za-z0-9_-]{8,128}$/.test(claims.emailKey);
}

function validateSecret(secret: string): void {
  if (secret.length < 32) throw new Error('EMAIL_VERIFICATION_SECRET must be at least 32 characters.');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
