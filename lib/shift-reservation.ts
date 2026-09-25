export function shiftReservationDecision(input: { exists: boolean; isActive: boolean; capacity: number; filled: number }): { ok: true } | { ok: false; code: 'not_found' | 'full'; message: string } {
  if (!input.exists || !input.isActive) return { ok: false, code: 'not_found', message: 'That shift is unavailable.' };
  if (input.filled >= input.capacity) return { ok: false, code: 'full', message: 'That shift just filled.' };
  return { ok: true };
}
