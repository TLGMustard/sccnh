export type EmailMessage = { to: string; subject: string; text: string; html: string };
export type EmailConfig = { apiKey: string; from: string };

export function emailConfigFromEnv(): EmailConfig {
  return { apiKey: process.env.RESEND_API_KEY ?? '', from: process.env.EMAIL_FROM ?? '' };
}

export async function sendEmail(message: EmailMessage, config: EmailConfig = emailConfigFromEnv()): Promise<void> {
  if (!config.apiKey || !config.from) throw new Error('Email delivery is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
}
