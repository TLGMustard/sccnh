export type SignupVerificationState = { phase: 'idle' | 'code-sent' | 'verified'; email: string };
export type SignupVerificationAction =
  | { type: 'code-requested'; email: string }
  | { type: 'confirmed'; email: string }
  | { type: 'email-changed'; email: string }
  | { type: 'reset' };

export const initialVerificationState: SignupVerificationState = { phase: 'idle', email: '' };

export function verificationReducer(state: SignupVerificationState, action: SignupVerificationAction): SignupVerificationState {
  if (action.type === 'reset') return initialVerificationState;
  if (action.type === 'email-changed') return action.email.trim().toLowerCase() === state.email ? state : initialVerificationState;
  const email = action.email.trim().toLowerCase();
  return { phase: action.type === 'confirmed' ? 'verified' : 'code-sent', email };
}

export function signupNextStep(required: boolean, state: SignupVerificationState, email: string): 'claim' | 'confirm' {
  if (!required) return 'claim';
  const normalized = email.trim().toLowerCase();
  return state.phase === 'code-sent' && state.email === normalized ? 'confirm' : 'claim';
}
