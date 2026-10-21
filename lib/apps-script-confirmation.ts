import { createHmac, randomBytes } from 'node:crypto';

export type AppsScriptReceipt = {
  email: string;
  firstName: string;
  appOrigin: string;
  shifts: Array<{ date: string; startsAt: string; endsAt: string; location: string; role: string }>;
};

export type AppsScriptConfig = { url: string; secret: string };
export type AppsScriptDelivery = { delivered: boolean; configured: boolean };

function usableConfig(config: AppsScriptConfig): AppsScriptConfig | null {
  try {
    const parsed = new URL(config.url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'script.google.com' || parsed.username || parsed.password || parsed.search || parsed.hash || !parsed.pathname.endsWith('/exec') || config.secret.length < 32) return null;
    return { url: parsed.toString(), secret: config.secret };
  } catch {
    return null;
  }
}

export function appsScriptConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AppsScriptConfig | null {
  return usableConfig({ url: env.APPS_SCRIPT_WEBHOOK_URL?.trim() ?? '', secret: env.APPS_SCRIPT_WEBHOOK_SECRET ?? '' });
}

function normalizedOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') throw new Error('Invalid application origin.');
  return url.origin;
}

export async function sendAppsScriptConfirmation(
  receipt: AppsScriptReceipt,
  config: AppsScriptConfig | null = appsScriptConfigFromEnv(),
  fetcher: typeof fetch = fetch,
): Promise<AppsScriptDelivery> {
  const usable = config && usableConfig(config);
  if (!usable) return { delivered: false, configured: false };
  try {
    const signedPayload = Buffer.from(JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      nonce: randomBytes(18).toString('base64url'),
      appOrigin: normalizedOrigin(receipt.appOrigin),
      receipt: {
        email: receipt.email,
        firstName: receipt.firstName,
        shifts: receipt.shifts,
      },
    }), 'utf8').toString('base64url');
    const signature = createHmac('sha256', usable.secret).update(signedPayload).digest('base64url');
    const response = await fetcher(usable.url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ payload: signedPayload, signature }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { delivered: false, configured: true };
    const body = await response.json().catch(() => null) as { ok?: unknown } | null;
    return { delivered: body?.ok === true, configured: true };
  } catch {
    console.error('Apps Script confirmation delivery failed');
    return { delivered: false, configured: true };
  }
}
