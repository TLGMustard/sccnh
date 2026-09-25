export function checkInDecision(input: { checkingIn: boolean; trainingComplete: boolean }): { allowed: boolean; message: string } {
  if (input.checkingIn && !input.trainingComplete) return { allowed: false, message: 'Complete training before check-in.' };
  return { allowed: true, message: input.checkingIn ? 'Volunteer checked in.' : 'Check-in removed.' };
}
