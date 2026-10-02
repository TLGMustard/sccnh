import { getDatabase } from '../db/index.ts';
import { isValidEmail, normalizeEmail } from './domain.ts';
import { keyedDigest } from './security-key.ts';
import {
  createVerificationCode,
  digestVerificationCode,
  verificationAttemptDecision,
  verificationSecret,
  verifyVerificationCode,
} from './email-verification.ts';
import { buildVerificationEmail } from './verification-email.ts';
import { sendEmail } from './email-provider.ts';

type VerificationRow = {
  id: string;
  email_key: string;
  code_digest: string;
  expires_at: number | string;
  attempts: number;
  consumed_at: number | string | null;
};

export async function requestEmailVerification(emailInput: string, now = Date.now()): Promise<void> {
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email) || new TextEncoder().encode(email).byteLength > 254) throw new Error('Invalid email address.');
  const secret = verificationSecret();
  const id = crypto.randomUUID();
  const code = createVerificationCode();
  const emailKey = keyedDigest('email-verification', email, secret);
  await getDatabase().unsafe(
    'INSERT INTO email_verifications (id, email_key, code_digest, expires_at, attempts, consumed_at, created_at) VALUES ($1, $2, $3, $4, 0, NULL, $5)',
    [id, emailKey, digestVerificationCode(id, code, secret), now + 10 * 60_000, now],
  );
  try {
    await sendEmail(buildVerificationEmail(email, code));
  } catch {
    console.error('verification email failed');
  }
}

export async function confirmEmailVerification(emailInput: string, code: string, now = Date.now()): Promise<string | null> {
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) return null;
  const secret = verificationSecret();
  const emailKey = keyedDigest('email-verification', email, secret);
  return getDatabase().begin(async (sql) => {
    const rows = await sql.unsafe<VerificationRow[]>(`SELECT id, email_key, code_digest, expires_at, attempts, consumed_at
      FROM email_verifications
      WHERE email_key = $1 AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE`, [emailKey]);
    const row = rows[0];
    if (!row) return null;
    const matched = verifyVerificationCode(row.id, code, row.code_digest, secret);
    const decision = verificationAttemptDecision({
      attempts: Number(row.attempts),
      consumedAt: row.consumed_at === null ? null : Number(row.consumed_at),
      expiresAt: Number(row.expires_at),
    }, matched, now);
    if (decision.attempts !== Number(row.attempts) || decision.consume) {
      await sql.unsafe('UPDATE email_verifications SET attempts = $1, consumed_at = $2 WHERE id = $3', [decision.attempts, decision.consume ? now : null, row.id]);
    }
    return decision.allowed ? emailKey : null;
  });
}
