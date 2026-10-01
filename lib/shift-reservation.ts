export function shiftReservationDecision(input: { exists: boolean; isActive: boolean; capacity: number; filled: number }): { ok: true } | { ok: false; code: 'not_found' | 'full'; message: string } {
  if (!input.exists || !input.isActive) return { ok: false, code: 'not_found', message: 'That shift is unavailable.' };
  if (input.filled >= input.capacity) return { ok: false, code: 'full', message: 'That shift just filled.' };
  return { ok: true };
}

export function shiftChangeDecision(input: { sourceExists: boolean; sourceShiftId: string; targetShiftId: string; targetExists: boolean; targetIsActive: boolean; targetCapacity: number; targetFilled: number }): { ok: true } | { ok: false; code: 'not_found' | 'full' | 'same_shift'; message: string } {
  if (!input.sourceExists) return { ok: false, code: 'not_found', message: 'That shift could not be found.' };
  if (input.sourceShiftId === input.targetShiftId) return { ok: false, code: 'same_shift', message: 'Choose a different shift.' };
  return shiftReservationDecision({ exists: input.targetExists, isActive: input.targetIsActive, capacity: input.targetCapacity, filled: input.targetFilled });
}
