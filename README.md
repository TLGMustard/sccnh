# SCCNH 2027 volunteer signup

Railway-ready signup and organizer system for Spread Cream Cheese Not Hate.

## Deploy on Railway

1. Create a Railway project from this private GitHub repository.
2. Add a PostgreSQL service to the project.
3. In the web service variables, set `DATABASE_URL` to the PostgreSQL service's `DATABASE_URL` reference.
4. Set `ADMIN_ACCESS_CODE_HASH`, `ADMIN_SESSION_SECRET`, and `RESEND_API_KEY` as Railway secrets.
5. Set `EMAIL_FROM` to a sender on your verified Resend domain and `APP_BASE_URL` to the public `https://` address for this service.
6. Deploy. Railway runs the database migration before starting the app.

Create the organizer access-code hash locally. Choose a code of 12 or more characters, then run:

```sh
node --experimental-strip-types scripts/hash-access-code.ts "your organizer access code"
```

Use the printed value for `ADMIN_ACCESS_CODE_HASH`. Create `ADMIN_SESSION_SECRET` with a password manager or a 32-byte random value.

## Privacy model

- Volunteer access codes are stored only as salted scrypt hashes.
- Email addresses and access codes are never placed in URLs.
- Public schedule responses contain no volunteer data.
- Private and organizer responses are sent with `no-store` caching and no referrer sharing.
- Organizer access requires an HTTP-only, strict same-site signed session cookie.
- Access-code attempts are size-limited, malformed JSON is rejected, and repeated requests are slowed at the app process.
- Confirmation receipts are sent through Resend after a reservation is saved. They contain shift details but never the access code.

Railway should keep this repository private and all three variables as secrets. If the service is scaled across several instances, also add Railway or Cloudflare rate limiting at the edge for a shared limit.
