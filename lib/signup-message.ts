export function savedSignupMessage(value: unknown): string {
  return typeof value === 'string' && value.trim()
    ? value
    : 'Shifts saved. View them in My shifts on this browser.';
}
