import { cookies } from 'next/headers';
import { readAdminSession } from './admin-session';

const COOKIE = 'sccnh_admin';

export async function isOrganizer(): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET ?? '';
  return readAdminSession((await cookies()).get(COOKIE)?.value, secret);
}

export const adminCookieName = COOKIE;
