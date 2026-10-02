import type { EmailMessage } from './email-provider.ts';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export function buildVerificationEmail(to: string, code: string): EmailMessage {
  const subject = 'Your SCCNH verification code';
  const text = `Your SCCNH verification code is ${code}.\n\nIt expires in 10 minutes. If you did not request this code, you can ignore this email.\n\nUF Hillel`;
  const html = `<p>Your SCCNH verification code is:</p><p><strong style="font-size:24px;letter-spacing:4px">${escapeHtml(code)}</strong></p><p>It expires in 10 minutes. If you did not request this code, you can ignore this email.</p><p>UF Hillel</p>`;
  return { to, subject, text, html };
}
