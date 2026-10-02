import { cookies } from 'next/headers';
import { adminCookieName, readAdminSession, type AdminSessionClaims } from './admin-session';

export async function organizerSession(): Promise<AdminSessionClaims | null> {
  const secret = process.env.ADMIN_SESSION_SECRET ?? '';
  return readAdminSession((await cookies()).get(adminCookieName())?.value, secret);
}

export async function isOrganizer(): Promise<boolean> {
  return Boolean(await organizerSession());
}
