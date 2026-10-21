export type SignupReceiptShift = {
  day: string;
  startsAt: string;
  endsAt: string;
  locationName: string;
  taskName: string;
};

export type SignupReceipt = {
  email: string;
  firstName: string;
  shifts: Array<{ date: string; startsAt: string; endsAt: string; location: string; role: string }>;
};

export function createSignupReceipt(
  profile: { email: string; firstName: string },
  shifts: SignupReceiptShift[],
): SignupReceipt {
  return {
    email: profile.email,
    firstName: profile.firstName,
    shifts: [...shifts]
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
      .map((shift) => ({ date: shift.day, startsAt: shift.startsAt, endsAt: shift.endsAt, location: shift.locationName, role: shift.taskName })),
  };
}
