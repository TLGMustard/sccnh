import { formatTime } from './domain.ts';
import type { AdminSnapshot } from './repository';

export const EXPORT_HEADERS = ['Date', 'Start (Eastern)', 'End (Eastern)', 'Location', 'Role', 'Volunteer', 'Personal email', 'Phone', 'Status', 'Training complete', 'Site lead interest', 'Signup ID'];

export function signupExportRows(data: AdminSnapshot): string[][] {
  const volunteers = new Map(data.volunteers.map((volunteer) => [volunteer.id, volunteer]));
  return [EXPORT_HEADERS, ...data.shifts.flatMap((shift) => {
    const signups = data.signups.filter((signup) => signup.shiftId === shift.id);
    const base = [shift.day, formatTime(shift.startsAt), formatTime(shift.endsAt), shift.location.name, shift.title ?? shift.task.name];
    if (!signups.length) return [[...base, '', '', '', 'Open', '', '', '']];
    return signups.map((signup) => [...base, signup.volunteerName, signup.email, signup.phone, signup.status, signup.trainingComplete ? 'Yes' : 'No', (signup.wantsSiteLead ?? volunteers.get(signup.volunteerId)?.wantsSiteLead) ? 'Yes' : 'No', signup.id]);
  })];
}

export function exportCsv(rows: string[][]): string {
  return '\uFEFF' + rows.map((row) => row.map((value) => {
    // Quoting alone does not prevent spreadsheet formula injection.
    const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
}
