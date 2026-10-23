import { getDatabase } from '../db/index.ts';
import { normalizeEmail, isValidEmail } from './domain.ts';
import { ACCOUNT_SESSION_SECONDS, hashPhone, newAccountToken, sessionDigest, normalizePhone, verifyPhone } from './volunteer-account.ts';

export type Account = { id: string; email: string; management_key: string };
export type AccountSession = { account: Account; token: string; created: boolean };

export async function authenticateAccount(emailInput: string, phoneInput: string, create = false): Promise<AccountSession | null> {
  const email = normalizeEmail(emailInput);
  const phone = normalizePhone(phoneInput);
  if (!isValidEmail(email) || Buffer.byteLength(email) > 254 || !phone) return null;
  const db = getDatabase();
  const [observed] = await db.unsafe<(Account & { phone_hash: string })[]>('SELECT id, email, management_key, phone_hash FROM volunteer_accounts WHERE email = $1', [email]);
  const matched = await verifyPhone(phone, observed?.phone_hash);
  const preparedHash = await hashPhone(phone);
  if (observed && !matched) return null;
  const token = newAccountToken();
  const now = Date.now();
  return db.begin(async (sql) => {
    await sql.unsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`volunteer-email:${email}`]);
    const [current] = await sql.unsafe<(Account & { phone_hash: string })[]>('SELECT id, email, management_key, phone_hash FROM volunteer_accounts WHERE email = $1', [email]);
    if (current && (current.id !== observed?.id || current.phone_hash !== observed?.phone_hash)) return null;
    const records = await sql.unsafe<{ id: string; phone: string; account_id: string | null }[]>('SELECT id, phone, account_id FROM volunteers WHERE email = $1', [email]);
    const matching = records.filter((row) => normalizePhone(row.phone) === phone);
    // Historical bookings require both contact fields. Signup may create a new
    // account only when no records exist for the email.
    if (!current && !matching.length && (records.length > 0 || !create)) return null;
    let result: Account | undefined = current;
    if (!result) {
      if (!preparedHash) return null;
      [result] = await sql.unsafe<Account[]>(`INSERT INTO volunteer_accounts (id, email, phone_hash, management_key, created_at)
        VALUES ($1, $2, $3, $4, $5) RETURNING id, email, management_key`, [crypto.randomUUID(), email, preparedHash, sessionDigest(newAccountToken()), Date.now()]);
    }
    const ids = matching.filter((row) => row.account_id === null).map((row) => row.id);
    if (ids.length) await sql.unsafe('UPDATE volunteers SET account_id = $1 WHERE id = ANY($2::text[]) AND account_id IS NULL', [result.id, ids]);
    await sql.unsafe('UPDATE signups SET management_key = $1, management_expires_at = $2 WHERE volunteer_id IN (SELECT id FROM volunteers WHERE account_id = $3)', [result.management_key, Date.now() + ACCOUNT_SESSION_SECONDS * 1000, result.id]);
    await sql.unsafe('DELETE FROM volunteer_sessions WHERE expires_at <= $1', [now]);
    await sql.unsafe('INSERT INTO volunteer_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)', [sessionDigest(token), result.id, now + ACCOUNT_SESSION_SECONDS * 1000]);
    return { account: { id: result.id, email: result.email, management_key: result.management_key }, token, created: !current };
  });
}

export async function discardUnusedAccount(account: Account): Promise<void> {
  await getDatabase().begin(async (sql) => {
    await sql.unsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`volunteer-email:${account.email}`]);
    await sql.unsafe('DELETE FROM volunteer_accounts a WHERE a.id = $1 AND NOT EXISTS (SELECT 1 FROM volunteers v WHERE v.account_id = a.id)', [account.id]);
  });
}

export async function accountForSession(token: string | undefined): Promise<Account | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await getDatabase().unsafe<Account[]>('SELECT a.id, a.email, a.management_key FROM volunteer_sessions s JOIN volunteer_accounts a ON a.id = s.account_id WHERE s.token_hash = $1 AND s.expires_at > $2', [sessionDigest(token), Date.now()]);
  return row ?? null;
}

export async function revokeAccountSession(token: string | undefined): Promise<void> {
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) await getDatabase().unsafe('DELETE FROM volunteer_sessions WHERE token_hash = $1', [sessionDigest(token)]);
}
