import { EVENT } from './event.ts';

export type SignupStatus = 'confirmed' | 'cancelled' | 'checked_in';
export type AvailabilityState = 'open' | 'filling' | 'full';
export type EventPhase = 'before' | 'during' | 'after';

export type Availability = {
  capacity: number;
  filled: number;
  remaining: number;
  state: AvailabilityState;
};

const OCCUPYING = new Set<SignupStatus>(['confirmed', 'checked_in']);

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function availability(capacity: number, statuses: SignupStatus[]): Availability {
  const safeCapacity = Math.max(0, Math.trunc(capacity));
  const filled = statuses.filter((status) => OCCUPYING.has(status)).length;
  const remaining = Math.max(0, safeCapacity - filled);
  return {
    capacity: safeCapacity,
    filled,
    remaining,
    state: remaining === 0 ? 'full' : safeCapacity > 0 && filled / safeCapacity >= 0.8 ? 'filling' : 'open',
  };
}

export function validateShiftWindow(startsAt: string, endsAt: string): string | null {
  if (startsAt.slice(0, 10) !== endsAt.slice(0, 10)) {
    return 'A shift must start and end on the same calendar day.';
  }
  if (!Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt))) {
    return 'A shift needs valid start and end times.';
  }
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    return 'A shift must end after its start.';
  }
  return null;
}

export function eventPhase(now = new Date().toISOString()): EventPhase {
  const time = Date.parse(now);
  const starts = Date.parse(`${EVENT.startDate}T00:00:00-05:00`);
  const ends = Date.parse(`${EVENT.endDate}T23:59:59-05:00`);
  return time < starts ? 'before' : time > ends ? 'after' : 'during';
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function formatTime(iso: string): string {
  const hour = Number(iso.slice(11, 13));
  const minute = iso.slice(14, 16);
  const meridiem = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 || 12;
  return `${h12}:${minute} ${meridiem}`;
}

export function formatTimeRange(startsAt: string, endsAt: string): string {
  const start = formatTime(startsAt);
  const end = formatTime(endsAt);
  const startMeridiem = start.slice(-2);
  return startMeridiem === end.slice(-2) ? `${start.slice(0, -3)}–${end}` : `${start}–${end}`;
}

export function formatDay(day: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}
