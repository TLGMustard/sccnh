export function resolveApplicationOrigin(configured: string, requestOrigin: string, production: boolean): string {
  const candidate = configured || (!production ? requestOrigin : '');
  if (!candidate) throw new Error('APP_BASE_URL is required.');
  const parsed = new URL(candidate);
  if (production && parsed.protocol !== 'https:') throw new Error('APP_BASE_URL must be an HTTPS origin.');
  if (parsed.username || parsed.password) throw new Error('APP_BASE_URL must not include credentials.');
  return parsed.origin;
}

export function getApplicationOrigin(requestOrigin = ''): string {
  return resolveApplicationOrigin(process.env.APP_BASE_URL ?? '', requestOrigin, process.env.NODE_ENV === 'production');
}
