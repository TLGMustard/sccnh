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

export async function readJsonRequest(request: Request): Promise<JsonRequestResult> {
  const contentType = request.headers.get('content-type');
  if (!contentType?.toLowerCase().startsWith('application/json')) return { ok: false, status: 415 };
  if (isDeclaredJsonBodyTooLarge(request.headers.get('content-length'))) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return parseJsonRequest(contentType, new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, status: 400 };
  }
}

export function requireSameOrigin(request: Request, expectedOrigin: string, production = process.env.NODE_ENV === 'production'): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const supplied = request.headers.get('origin');
  if (!supplied) return !production;
  try {
    return new URL(supplied).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
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
