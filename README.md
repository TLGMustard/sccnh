# SCCNH 2027 volunteer signup

Railway-ready signup and organizer system for Spread Cream Cheese Not Hate.

## Deploy on Railway

1. Create a Railway project from this private GitHub repository.
2. Add a PostgreSQL service to the project.
3. In the web service variables, set `DATABASE_URL` to the PostgreSQL service's `DATABASE_URL` reference.
4. Set `ADMIN_ACCESS_CODE_HASH` and `ADMIN_SESSION_SECRET` as Railway secrets.
5. Deploy. Railway runs the database migration before starting the app.

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

Railway should keep this repository private and all three variables as secrets. If the service is scaled across several instances, also add Railway or Cloudflare rate limiting at the edge for a shared limit.
