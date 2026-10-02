import { formatDay, formatTimeRange } from './domain.ts';
import { sendEmail, type EmailConfig } from './email-provider.ts';

export type ConfirmationMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type ConfirmationInput = {
  to: string;
  firstName: string;
  location: string;
  startsAt: string;
  endsAt: string;
  appBaseUrl: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export function buildShiftConfirmation(input: ConfirmationInput): ConfirmationMessage {
  const day = formatDay(input.startsAt.slice(0, 10));
  const time = formatTimeRange(input.startsAt, input.endsAt);
  const baseUrl = new URL(input.appBaseUrl).origin;
  const subject = `SCCNH shift confirmed: ${day} at ${time}`;
  const text = `Hi ${input.firstName},\n\nYour SCCNH shift is confirmed.\n\n${day}\n${time}\n${input.location}\n\nComplete the required 1.5-hour training before your shift. Bring your SCCNH shirt. Event shirts are provided at training.\n\nView or cancel your shift: ${baseUrl}\n\nUF Hillel`;
  const html = `<p>Hi ${escapeHtml(input.firstName)},</p><p>Your SCCNH shift is confirmed.</p><p><strong>${escapeHtml(day)}</strong><br>${escapeHtml(time)}<br>${escapeHtml(input.location)}</p><p>Complete the required 1.5-hour training before your shift. Bring your SCCNH shirt. Event shirts are provided at training.</p><p><a href="${escapeHtml(baseUrl)}">View or cancel your shift</a></p><p>UF Hillel</p>`;
  return { to: input.to, subject, text, html };
}

export async function sendShiftConfirmation(
  message: ConfirmationMessage,
  config?: EmailConfig,
): Promise<void> {
  await sendEmail(message, config);
}

export async function attemptShiftConfirmation(send: () => Promise<void>): Promise<boolean> {
  try {
    await send();
    return true;
  } catch (error) {
    console.error('confirmation email failed', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}
