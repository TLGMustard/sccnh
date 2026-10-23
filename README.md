# SCCNH 2027 volunteer signup

Railway-hosted signup and organizer system for Spread Cream Cheese Not Hate.

## Security model

- Volunteers select up to 20 shifts and submit their name, personal email, required phone, and consent once. All selected shifts are reserved in a single transaction. Overlapping selections and bookings are refused. Site-lead records remain organizer-managed.
- Bagel Day is **January 28, 2027**. Pre-packaging is **January 27**; announcing stays January 25. Shift IDs are preserved so existing bookings move to the corrected date. Organizer capacity overrides are retained.
- Volunteers sign in with the same personal email and phone number used at signup. Both must match. US phone numbers normalize optional country code and punctuation. This is contact matching, not proof of email ownership; anyone who knows both details can manage those bookings. Use verified email codes if stronger identity assurance becomes necessary.
- Successful sign-in issues a random, HTTP-only session cookie. Only its SHA-256 digest is stored in PostgreSQL; it expires after 30 days and is revoked on sign-out. A second device receives its own session and can view, change, or cancel the same shifts. Phone login credentials are stored as salted scrypt hashes; organizers still have the original contact phone in the roster.
- The signup stores the submitted contact details, consent timestamp, and consent version with each booking. An existing volunteer's contact profile is never overwritten solely because someone typed the same email.
- The first successful email-and-phone sign-in links historical registrations that match both contact fields, preserving shift IDs, consent, training, and organizer records. A record with the same email and a different phone remains unlinked. An established account's phone cannot be replaced through public signup. Contact an organizer to correct an older phone number.
- Organizer access codes and legacy volunteer access codes are stored only as salted scrypt hashes. Existing code-protected API access remains supported for legacy bookings.
- The legacy email verification API remains available but is separate from the new password-free signup; its verification codes are keyed digests and expire after ten minutes.
- Email addresses and access codes never appear in URLs or public responses.
- Sensitive APIs use shared PostgreSQL rate limits, bounded request bodies, same-origin checks, and `no-store` responses.
- Organizer access uses a signed, HTTP-only, host-only production cookie. Deleting a volunteer requires the organizer access code again.
- Organizer mutations write redacted audit records. Audit actor identifiers are keyed digests, not raw session IDs, IP addresses, or email addresses.
- Shift claims and capacity changes lock the shift row so concurrent requests cannot overbook it.

## Organizer rosters and exports

Organizer → Shifts shows the people registered for every shift, with date, time, location, email, phone, and training. Filters select a day or location without changing the export.

**Download CSV for Excel** exports the full schedule with one row per active booking and a placeholder row for an empty shift. The CSV includes personal email, phone, site-lead interest, and training. It contains no access-code hashes or browser tokens, uses UTF-8 with a BOM, and escapes spreadsheet formulas. Import it into Excel or Google Sheets.

**Export to Google Sheets** updates the dedicated `SCCNH Signups` tab in an authorized spreadsheet. It requires a one-time setup:

1. Enable the Google Sheets API in a Google Cloud project and create a service account with a JSON key. See [Google's service account guide](https://developers.google.com/identity/protocols/oauth2/service-account).
2. Create a private destination spreadsheet and share it with that service account's `client_email` as Editor. Do not make the roster public.
3. Add `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_CLIENT_EMAIL`, and `GOOGLE_SHEETS_PRIVATE_KEY` to the Railway web service. Use the spreadsheet ID from its URL, and the `client_email` and `private_key` from the JSON key. A multiline PEM or literal `\n` characters both work.
4. Redeploy. In Organizer, click **Export to Google Sheets**, then **Open spreadsheet**. Only the reserved `SCCNH Signups` tab is refreshed. Keep manual notes in a separate tab. Each refresh replaces the reserved tab's values and removes stale bookings, using literal text cells to prevent formulas supplied by volunteers from executing.

Without these Google credentials, CSV download works and the Sheets button reports the missing setup. No contact data is sent to Google until an authenticated organizer explicitly exports it. Both export actions require an organizer session, are rate-limited and audited, and return `no-store` responses. Service-account credentials stay on the server.

## Account and font update rollout

The website uses Poppins for both headings and body text. Signup no longer asks about site-lead interest or states a training duration. The SCCNH shirt reminder remains.

Keep Railway's pre-deploy command `npm run db:migrate`. Migration `0006` adds volunteer accounts, revocable sessions, and a nullable link on existing volunteer records. No new environment variables are required. Existing bookings are linked only after the email and normalized phone match. Organizers retain existing site-lead and training records. To update the confirmation email wording, deploy the revised `docs/apps-script-confirmation-web-app.gs` in Apps Script as a new version.

Test a multi-shift signup, sign out, then sign in on a second device using the same email and phone. Confirm that wrong phone details reveal no bookings and that a shift change on either device appears on the other after refresh.

## October 19 schedule update

Deploy this version with the existing Railway pre-deploy command `npm run db:migrate`. Migrations `0003` through `0005` add nullable browser-management fields and registration snapshots and isolate browser registrations from legacy accounts; legacy records stay intact. Back up PostgreSQL first. The first schedule read atomically updates the corrected dates in place. No Resend installation or new signup-session secret is required. Keep `RATE_LIMIT_SECRET`, `ADMIN_ACCESS_CODE_HASH`, `ADMIN_SESSION_SECRET`, `DATABASE_URL`, and `APP_BASE_URL` configured as before.

Check the named roster and CSV as an organizer. The Google Sheets connection needs the three variables above before its button can export to Google.

## Google Workspace confirmation email

The website sends one confirmation receipt per completed multi-shift signup through a Google Apps Script web app. It sends no email when the signup fails, and an email delivery failure never reverses a valid reservation.

1. In the nonprofit Workspace account that should send receipts, create or open the Apps Script project. Replace its contents with [`docs/apps-script-confirmation-web-app.gs`](docs/apps-script-confirmation-web-app.gs).
2. In **Project Settings → Script Properties**, add `SCCNH_WEBHOOK_SECRET`. Generate its value with `openssl rand -base64 48`. Do not use an organizer code or reuse another secret.
3. Deploy the project as a **Web app**: execute as the designated Workspace account, and allow access from anyone. Railway authenticates every request with the secret and timestamp; the script also uses a short replay guard. If your Workspace policy forbids external web apps, ask its administrator to permit this narrowly scoped deployment.
4. In Railway’s web service, add `APPS_SCRIPT_WEBHOOK_URL` with the deployment’s `/exec` URL and `APPS_SCRIPT_WEBHOOK_SECRET` with the exact same generated secret. Keep both private. The URL is only read by the server and is never delivered to the browser.
5. Redeploy, then make one controlled signup with an inbox you own. The success message must say **“Confirmation email sent.”** If it instead says delivery could not be completed, inspect the Apps Script execution history without logging volunteer data.

The script accepts only a short-lived signed body, uses a cache-backed five-minute replay guard, validates the event’s expected dates and receipt fields, and logs no contact information. It returns an explicit success acknowledgement only after `MailApp` accepts the message. Google Workspace mail quota still applies.

## Railway variables

Set every variable on the web service. Use a Railway reference for the database URL and mark all secrets private.

```dotenv
DATABASE_URL=<Railway PostgreSQL reference>
APP_BASE_URL=https://creamcheese.up.railway.app
ADMIN_ACCESS_CODE_HASH=<full output of scripts/hash-access-code.ts>
ADMIN_SESSION_SECRET=<at least 32 random characters>
RATE_LIMIT_SECRET=<different 32-byte random secret>
EMAIL_VERIFICATION_SECRET=<different 32-byte random secret>
RESEND_API_KEY=<Resend secret>
EMAIL_FROM=<verified sender>
EMAIL_VERIFICATION_REQUIRED=false
APPS_SCRIPT_WEBHOOK_URL=<Apps Script /exec URL>
APPS_SCRIPT_WEBHOOK_SECRET=<same random secret stored in Script Properties>
```

`ADMIN_SESSION_SECRET`, `RATE_LIMIT_SECRET`, and `EMAIL_VERIFICATION_SECRET` must be different values. Generate each separately:

```sh
openssl rand -base64 48
```

Create the organizer hash from the repository directory. Use a code with 12 to 128 characters:

```sh
node --experimental-strip-types scripts/hash-access-code.ts "your organizer access code"
```

Copy the full output into `ADMIN_ACCESS_CODE_HASH`. It must include the `scrypt$` prefix and every following field. Do not set the variable to the plain organizer code.

## Safe deployment

1. Create a Railway PostgreSQL backup.
2. Confirm the web service uses the PostgreSQL service's `DATABASE_URL` reference.
3. Add `RATE_LIMIT_SECRET` and `EMAIL_VERIFICATION_SECRET` as separate secrets.
4. Set `APP_BASE_URL` exactly to `https://creamcheese.up.railway.app`.
5. Keep `EMAIL_VERIFICATION_REQUIRED=false` for the first deployment.
6. Deploy. Railway runs `npm run db:migrate` before starting the app.
7. Run the non-destructive smoke test:

   ```sh
   APP_BASE_URL=https://creamcheese.up.railway.app node --experimental-strip-types scripts/security-smoke.ts
   ```

8. Confirm organizer sign-in, sign-out, navigation, training, and rejection of a capacity below current signups.
9. Complete one multi-shift signup with a test identity you control. Sign in with its email and phone on a second browser, change a shift, cancel it, then remove that test volunteer from Organizer with reauthentication.
10. Keep the optional legacy email-verification flow disabled until email sending is configured and tested. The current signup does not depend on Resend or that legacy flag.

The smoke script does not create or delete volunteer records. Optional `SECURITY_TEST_EMAIL`, `SECURITY_TEST_ACCESS_CODE`, and `SECURITY_TEST_SHIFT_ID` values let it verify access to one dedicated test signup without changing it. `SECURITY_TEST_RATE_LIMITS=true` intentionally saturates the lookup and organizer-login buckets for about 15 minutes; use it only in a controlled test window.

After the controlled test, search Railway logs for the test email, phone, access code, and verification code. None should appear. Check `admin_audit_log` for action and outcome rows without personal data or raw session IDs.

## Local release checks

Use a disposable PostgreSQL database for the integration suite. The suite refuses a Railway URL unless `ALLOW_REMOTE_SECURITY_TESTS=true` is explicitly set.

```sh
npm ci
npm test
TEST_DATABASE_URL=postgresql://localhost/sccnh_security_test npm run test:integration
npm run lint
npm run build
npm audit --omit=dev --audit-level=moderate
```

The signup integration file only accepts a loopback database URL. It checks batch atomicity, contention, cross-device access, wrong-phone isolation, session revocation and expiry, historical booking linking, duplicate prevention, consent snapshots, and preservation of existing bookings during the date correction. `scripts/signup-smoke.ts` tests the HTTP routes against a local server at `http://127.0.0.1:3117` (override with `SIGNUP_TEST_ORIGIN`). Use a disposable local database and the test organizer code `LocalOrganizer!2027` or set `LOCAL_ORGANIZER_ACCESS_CODE`. Keep Google Sheets and email delivery variables empty on that server. The smoke test verifies sign-in, failed-first-booking recovery, private access, exports, changes, cancellation, and organizer removal of its local test records. It refuses remote server URLs.

## Rollback

Leave `EMAIL_VERIFICATION_REQUIRED=false` if email delivery is not proven. Keep the database migrations and volunteer data in place when recovering a failed deployment. After browser registrations exist, releases before this update assume one record per email and are not compatible with the new browser-isolated records. Prefer a forward fix; a rollback build must retain the `browser_key IS NULL` filter for legacy authentication and the browser-session routes. Do not restore the old globally unique email index, delete migrations, or restore an older database as a routine application rollback.

## Deferred work

Per-person organizer accounts and application-level encryption for volunteer contact fields are separate projects. Until then, keep PostgreSQL on Railway private networking, limit database credentials to this service, restrict Railway project access, and retain tested backups.
