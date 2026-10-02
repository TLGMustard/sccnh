# SCCNH Security Hardening Design

## Goal

Close the practical abuse paths found in the October 2026 red-team review without changing the volunteer schedule, removing the access-code model, or interrupting the live Railway deployment.

## Threat model

The public site must tolerate anonymous internet traffic. An attacker may submit arbitrary headers and JSON, retry requests across multiple Railway instances, race shift claims, know a volunteer's email address, or induce a victim to visit a hostile site. The attacker does not control the victim's email inbox, Railway secrets, PostgreSQL credentials, or the organizer access code.

The organizer area contains volunteer names, email addresses, phone numbers, training status, and attendance. Treat every organizer response and mutation as sensitive.

## Security decisions

### First-signup ownership

- A new email address must be verified before it can create a volunteer record or reserve its first shift.
- Verification uses a six-digit, single-use code delivered by email. The database stores only a keyed digest of the email and code, an expiry, an attempt count, and consumption state.
- A successful verification creates a short-lived, signed, HTTP-only cookie bound to the normalized email. The cookie contains no raw email address.
- Existing volunteers continue to use their access code. Email verification never bypasses an existing access code.
- Without a proof cookie, a claim proceeds directly only when the supplied access code authenticates an existing volunteer. An unknown email and a wrong code for an existing email both receive the same verification-required response after the same scrypt work.
- Verification request and confirmation responses are generic. They do not disclose whether an email already has an account.
- Enforcement is feature-gated for safe rollout. Code ships first, email delivery is tested, then `EMAIL_VERIFICATION_REQUIRED=true` is enabled.

### Abuse controls

- Replace process-memory throttles with atomic PostgreSQL counters shared by every Railway instance.
- Rate-limit primarily by action plus a keyed digest of normalized email or other account identifier. Forwarded IP data is secondary because client-supplied forwarding headers are not trusted as the only control.
- Add a global organizer-login ceiling so forged forwarding headers cannot make brute force unbounded.
- No raw email address, phone number, access code, verification code, or full IP address is stored in a rate-limit key or audit record.

### Credentials and sessions

- Preserve salted scrypt hashes for volunteer and organizer access codes.
- Run one scrypt verification for syntactically valid lookup attempts even when the email does not exist, using a fixed valid dummy hash.
- Remove the unconditional development-mode organizer bypass. Local development uses explicit local secrets.
- Organizer sessions use a `__Host-` cookie in production, last four hours, support explicit logout, and carry a random session identifier for audit attribution.
- Destructive volunteer deletion requires the organizer access code again.

### Request and response boundary

- Read JSON as a byte stream and stop at 8 KiB. Do not buffer an unbounded body before checking its actual size.
- Enforce exact field limits: names 1 to 80 Unicode characters, email at most 254 bytes, phone at most 32 characters and 7 to 15 digits, access code 12 to 128 characters, identifiers at most 128 characters, verification code exactly six digits.
- Reject browser mutations whose `Origin` does not equal the configured application origin.
- In production, require a valid HTTPS `APP_BASE_URL`; never fall back to the request `Host` when creating email links.
- Send HSTS, frame denial, MIME sniffing denial, no-referrer, permissions restrictions, and a restrictive Content Security Policy on pages and APIs. Keep sensitive API responses private and non-cacheable.

### Database integrity

- Serialize claims and capacity changes by locking the target shift row inside a PostgreSQL transaction, then count occupied signups in a second statement after the lock is acquired so a waiting transaction cannot reuse a stale statement snapshot.
- Preserve the atomic change-shift guarantee: the original shift remains confirmed unless the target reservation succeeds.
- Add non-validating database length constraints so new bad rows are rejected without risking a migration failure on existing data.

### Organizer accountability

- Record every organizer mutation and login outcome with action, target, result, timestamp, and a keyed session or request digest.
- Do not record passwords, access codes, volunteer email addresses, phone numbers, or request bodies.
- Keep the current shared organizer credential for this release. Per-person organizer accounts and named attribution require a separate identity project.

### Dependency policy

- Upgrade the compatible React/Vinext/Vite set to patched versions verified on October 2, 2026.
- Keep the `shadcn` command-line package out of production dependencies while preserving build-time CSS generation.
- Gate release on a clean production dependency audit, passing tests, and a successful production build. Document any dev-only advisory that cannot be removed without replacing the build toolchain.

## Rollout

1. Back up PostgreSQL and capture baseline tests, build, and production audit.
2. Deploy schema, request, session, concurrency, logging, and dependency fixes with email verification enforcement disabled.
3. Add Railway secrets, verify code delivery against a controlled inbox, then enable email verification.
4. Run live anonymous, volunteer, and organizer smoke tests and inspect logs for secrets or personal data.
5. Keep rollback limited to the application release and feature flag. Database additions are backward-compatible and remain in place.

## Deferred work

- Per-person organizer accounts with revocation and named audit attribution.
- Application-level encryption of existing volunteer personal data. Email lookup needs a blind-index migration and key-rotation design; doing it inside this release would create a larger availability and recovery risk.
- A third-party WAF or bot challenge. The database-backed controls in this release do not depend on another paid service.

## Acceptance criteria

- A person who cannot read an email inbox cannot create the first account for that email.
- Missing and existing-email access-code failures perform the same expensive verification path and return the same public failure shape.
- Limits survive process restarts and multiple Railway instances.
- Twenty concurrent claims cannot exceed a shift's capacity, and a capacity decrease cannot go below occupied seats.
- Oversized chunked JSON is rejected after 8 KiB, foreign-origin mutations are rejected, and hostile `Host` values cannot enter emails.
- Anonymous organizer reads and mutations remain `401`; logout invalidates the browser cookie; deletion requires fresh credential proof.
- Organizer actions create redacted audit rows.
- Pages and APIs return the planned security headers and sensitive responses remain `no-store`.
- `npm test`, the database integration suite, `npm run build`, and `npm audit --omit=dev` pass before production rollout.
