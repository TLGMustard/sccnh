const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function volunteerRemovalDecision(volunteerId: string): { ok: true } | { ok: false; message: string } {
  return UUID.test(volunteerId) ? { ok: true } : { ok: false, message: 'Volunteer not found.' };
}
