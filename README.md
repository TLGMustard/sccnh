# SCCNH 2027 volunteer signup

Railway-hosted signup and organizer system for Spread Cream Cheese Not Hate.

## Security model

- Volunteers verify their personal email with a six-digit code before signup or managing shifts. The code is stored as a keyed digest and expires after ten minutes. The proof cookie lasts 15 minutes.
- Organizer access is separate and remains protected by an access code stored as a salted scrypt hash.
- Email addresses and organizer access codes never appear in URLs or public responses.
- Sensitive APIs use shared PostgreSQL rate limits, bounded request bodies, same-origin checks, and `no-store` responses.
- Organizer access uses a signed, HTTP-only, host-only production cookie. Deleting a volunteer requires the organizer access code again.
- Organizer mutations write redacted audit records. Audit actor identifiers are keyed digests, not raw session IDs, IP addresses, or email addresses.
- Shift claims and capacity changes lock the shift row so concurrent requests cannot overbook it.

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
GOOGLE_SHEETS_SPREADSHEET_ID=<private destination spreadsheet ID>
GOOGLE_SHEETS_TAB_NAME=Signups
GOOGLE_SERVICE_ACCOUNT_JSON=<full service-account JSON, private Railway variable>
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

For one-click Google Sheets export, create a Google Cloud service account with Sheets API access, share the SCCNH 2027 Shift Signups spreadsheet with its `client_email` as an editor, and set both `GOOGLE_SHEETS_SPREADSHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_JSON` as private Railway variables. The export replaces columns A:J on the `Signups` tab with active signup rows; do not use that tab for unrelated data. The CSV download is available without service-account credentials and can be opened in Excel or imported into Sheets. Never put the spreadsheet ID or service-account JSON in git.

## Safe deployment

1. Create a Railway PostgreSQL backup.
2. Confirm the web service uses the PostgreSQL service's `DATABASE_URL` reference.
3. Add `RATE_LIMIT_SECRET` and `EMAIL_VERIFICATION_SECRET` as separate secrets.
4. Set `APP_BASE_URL` exactly to `https://creamcheese.up.railway.app`.
5. Configure `RESEND_API_KEY` and a verified `EMAIL_FROM`, then test delivery before opening signups. Email verification is mandatory and fails closed if delivery is unavailable.
6. Deploy. Railway runs `npm run db:migrate` before starting the app.
7. Run the non-destructive smoke test:

   ```sh
   APP_BASE_URL=https://creamcheese.up.railway.app node --experimental-strip-types scripts/security-smoke.ts
   ```

8. Confirm organizer sign-in, sign-out, navigation, training, and rejection of a capacity below current signups.
9. Request and confirm a verification code with an inbox you control.
10. Complete one controlled signup. Verify its confirmation email, view it in My Shifts, change it, cancel it, then remove that test volunteer from Organizer with reauthentication. Check the roster and Sheet export.

The smoke script does not create or delete volunteer records. `SECURITY_TEST_RATE_LIMITS=true` intentionally saturates the lookup and organizer-login buckets for about 15 minutes; use it only in a controlled test window.

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

## Rollback

Do not open signups if email delivery is not proven. If a release fails, redeploy the previous application commit and keep the additive security tables in place. Do not delete migrations or restore an older database unless Railway support and a verified backup require it.

## Deferred work

Per-person organizer accounts and application-level encryption for volunteer contact fields are separate projects. Until then, keep PostgreSQL on Railway private networking, limit database credentials to this service, restrict Railway project access, and retain tested backups.
