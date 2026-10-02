import { getDatabase } from '../db/index.ts';
import { keyedDigest } from './security-key.ts';

export type RateLimitPolicy = { scope: string; limit: number; windowMs: number };
export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function rateBucketStart(now: number, windowMs: number): number {
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(windowMs) || windowMs <= 0) throw new Error('Invalid rate-limit window.');
  return Math.floor(now / windowMs) * windowMs;
}

export function buildRateBucketKey(policy: RateLimitPolicy, identity: string, secret: string, now = Date.now()): string {
  const start = rateBucketStart(now, policy.windowMs);
  return `${policy.scope}:${start}:${keyedDigest(policy.scope, identity, secret)}`;
}

export function rateLimitDecision(count: number, limit: number, now: number, bucketStart: number, windowMs: number): RateLimitResult {
  return { allowed: count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((bucketStart + windowMs - now) / 1000)) };
}

export async function consumeRateLimit(policy: RateLimitPolicy, identity: string, now = Date.now(), secret = process.env.RATE_LIMIT_SECRET ?? ''): Promise<RateLimitResult> {
  if (!Number.isInteger(policy.limit) || policy.limit < 1) throw new Error('Invalid rate-limit policy.');
  const bucketStart = rateBucketStart(now, policy.windowMs);
  const bucketKey = buildRateBucketKey(policy, identity, secret, now);
  const expiresAt = bucketStart + policy.windowMs + 24 * 60 * 60 * 1000;
  const sql = getDatabase();
  const rows = await sql.unsafe<{ count: number }[]>(`INSERT INTO security_rate_limits (bucket_key, count, expires_at)
    VALUES ($1, 1, $2)
    ON CONFLICT (bucket_key)
    DO UPDATE SET count = security_rate_limits.count + 1, expires_at = EXCLUDED.expires_at
    RETURNING count`, [bucketKey, expiresAt]);
  await sql.unsafe('DELETE FROM security_rate_limits WHERE expires_at < $1', [now]);
  return rateLimitDecision(Number(rows[0].count), policy.limit, now, bucketStart, policy.windowMs);
}
