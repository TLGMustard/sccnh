const MAX_JSON_BYTES = 8192;

export type JsonRequestResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: 400 | 413 | 415 };

export function parseJsonRequest(contentType: string | null, body: string): JsonRequestResult {
  if (!contentType?.toLowerCase().startsWith('application/json')) return { ok: false, status: 415 };
  if (new TextEncoder().encode(body).byteLength > MAX_JSON_BYTES) return { ok: false, status: 413 };
  try {
    const value: unknown = JSON.parse(body);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ok: true, value: value as Record<string, unknown> }
      : { ok: false, status: 400 };
  } catch {
    return { ok: false, status: 400 };
  }
}

export function isDeclaredJsonBodyTooLarge(contentLength: string | null): boolean {
  if (!contentLength || !/^\d+$/.test(contentLength)) return false;
  return Number(contentLength) > MAX_JSON_BYTES;
}

export const sensitiveResponseHeaders = {
  'Cache-Control': 'no-store, private',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function createRateLimiter(limit: number, windowMs: number) {
  const attempts = new Map<string, number[]>();
  return {
    allow(key: string, now = Date.now()): boolean {
      const recent = (attempts.get(key) ?? []).filter((at) => at > now - windowMs);
      if (recent.length >= limit) {
        attempts.set(key, recent);
        return false;
      }
      recent.push(now);
      attempts.set(key, recent);
      return true;
    },
  };
}
