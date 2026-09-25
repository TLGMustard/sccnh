import { isValidEmail, normalizeEmail } from './domain.ts';

export type SignupProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  wantsSiteLead: boolean;
};

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
  if (!value.firstName || !value.lastName || !isValidEmail(value.email) || value.phone.replace(/\D/g, '').length < 7) {
    return { ok: false, message: 'Enter your name, email, and phone number.' };
  }
  return { ok: true, value };
}
