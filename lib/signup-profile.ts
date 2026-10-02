import { isValidEmail, normalizeEmail } from './domain.ts';

export type SignupProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  wantsSiteLead: boolean;
};

const NAME_MAX = 80;
const EMAIL_MAX_BYTES = 254;
const PHONE_MAX = 32;
const PHONE_DIGITS_MIN = 7;
const PHONE_DIGITS_MAX = 15;

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

export function boundedIdentifier(value: unknown): string | null {
  return typeof value === 'string' && value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9:_-]+$/.test(value) ? value : null;
}

export function normalizeSignupProfile(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  wantsSiteLead: unknown;
}): { ok: true; value: SignupProfile } | { ok: false; message: string } {
  const value = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: normalizeEmail(input.email),
    phone: input.phone.trim(),
    wantsSiteLead: input.wantsSiteLead === true,
  };
  const phoneDigits = value.phone.replace(/\D/g, '').length;
  if (
    !value.firstName || value.firstName.length > NAME_MAX || hasControlCharacters(value.firstName) ||
    !value.lastName || value.lastName.length > NAME_MAX || hasControlCharacters(value.lastName) ||
    !isValidEmail(value.email) || new TextEncoder().encode(value.email).byteLength > EMAIL_MAX_BYTES ||
    !value.phone || value.phone.length > PHONE_MAX || hasControlCharacters(value.phone) ||
    phoneDigits < PHONE_DIGITS_MIN || phoneDigits > PHONE_DIGITS_MAX
  ) {
    return { ok: false, message: 'Enter your name, email, and phone number.' };
  }
  return { ok: true, value };
}
