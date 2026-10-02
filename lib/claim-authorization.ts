export function claimAuthorizationDecision(input: {
  verificationRequired: boolean;
  hasEmailProof: boolean;
  existingAccessVerified: boolean;
}): 'allow' | 'verify-email' {
  if (!input.verificationRequired || input.hasEmailProof || input.existingAccessVerified) return 'allow';
  return 'verify-email';
}
