# SCCNH Railway Privacy and Minimalism Design

## Goal

Deliver a Railway-ready SCCNH signup site with a compact blue-and-orange interface and private volunteer self-service.

## Product rules

- The public screen leads with the schedule, not a marketing introduction.
- Keep dates, locations, shift time, availability, training type, and the contact-consent notice. Cut explanatory copy that training covers.
- `Spread` and `Not Hate` are blue. `Cream Cheese` is orange. Headings never use body black.
- Day tabs use a three-column segmented control with contained, non-wrapping labels at every supported width.
- Copy uses a conversational-professional operator voice: direct, specific, and short. Do not ship em dashes, hype, filler, assistant boilerplate, decorative emoji, or formulaic recap copy.

## Privacy boundary

- A volunteer sets an access code on their first signup. The browser never stores the code unless the volunteer explicitly enters it again; the server stores only a per-volunteer salted scrypt hash.
- The code must be 12 to 128 characters. An email alone cannot retrieve shifts, create another shift for an existing account, or cancel a signup.
- `My shifts` accepts an email and code only in a JSON request body. Neither value appears in a URL or a response meant for anonymous callers.
- Public responses contain schedule data only. Volunteer contact data appears only after a valid code or in the organizer interface.
- Cancellation requires the matching access code. Failures are generic so an attacker cannot enumerate email addresses or signup records.
- Organizer endpoints remain signed-in only in production. Public and sensitive responses use `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.

## Railway architecture

- Replace Cloudflare D1 bindings with Railway PostgreSQL through `DATABASE_URL` and `postgres`.
- Keep the App Router and Vinext server; run it with `vinext start` on Railway's `PORT`.
- Use a PostgreSQL Drizzle schema and committed migration. Railway runs migrations as a pre-deploy command, then starts the app.
- The new GitHub repository is private. Railway receives `DATABASE_URL` from its PostgreSQL service and no code or access-code secret is committed.

## Verification

- Unit-test access-code normalization, scrypt hashing, rejection of malformed/oversized codes, and failed-code verification.
- Route-level red-team tests cover email-only lookup, mismatched cancellation, unauthenticated organizer requests, non-cacheable sensitive responses, and invalid JSON/body sizes.
- Build, targeted lint, database migration generation/inspection, and a local PostgreSQL-backed signup flow must pass before commit.
