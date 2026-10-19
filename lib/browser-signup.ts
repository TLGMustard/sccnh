import { createHash, randomBytes } from 'node:crypto';
import { boundedIdentifier } from './signup-profile.ts';

export const BROWSER_SESSION_SECONDS = 120 * 24 * 60 * 60;
export const MAX_SELECTED_SHIFTS = 20;

export function browserCookieName(production = process.env.NODE_ENV === 'production'): string {
  return production ? '__Host-sccnh_volunteer' : 'sccnh_volunteer';
}

export function validBrowserToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function newBrowserToken(): string { return randomBytes(32).toString('base64url'); }
export function browserManagementKey(token: string): string {
  if (!validBrowserToken(token)) throw new Error('Invalid browser session.');
  return createHash('sha256').update(`sccnh-volunteer-v1:${token}`).digest('hex');
}

export function selectedShiftIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.length || value.length > MAX_SELECTED_SHIFTS) return null;
  if (!value.every((id) => boundedIdentifier(id))) return null;
  return new Set(value).size === value.length ? [...value].sort((a, b) => a.localeCompare(b)) : null;
}

export function shiftsOverlap(shifts: { startsAt: string; endsAt: string }[]): boolean {
  const ordered = [...shifts].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return ordered.some((shift, index) => index > 0 && Date.parse(shift.startsAt) < Date.parse(ordered[index - 1].endsAt));
}
