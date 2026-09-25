# SCCNH Railway Privacy and Minimalism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the SCCNH signup platform to Railway PostgreSQL while replacing email-only volunteer access with a private user-created access code and a compact blue-and-orange interface.

**Architecture:** The app remains a Vinext App Router application, but uses Node-compatible PostgreSQL queries instead of Cloudflare D1. A new `lib/access-code.ts` module owns code validation and scrypt verification. Public routes expose schedule information only; sensitive volunteer data is returned only after email-and-code verification.

**Tech Stack:** Vinext, React 19, TypeScript, PostgreSQL, `postgres`, Drizzle Kit, Node `crypto.scrypt`, Railway Railpack.

**Spec:** `docs/superpowers/specs/2026-09-11-railway-privacy-minimalism-design.md`

## Global Constraints

- Preserve 49 shifts and 976 initial spaces.
- Use blue and orange for headings; reserve black for body copy.
- Access codes are 12–128 characters and are stored only as salted scrypt hashes.
- Never put email addresses, access codes, volunteer IDs, or signup IDs in public URLs.
- Do not ship em dashes or filler copy.
- Railway requires `DATABASE_URL`; no local or production secret belongs in Git.

---

### Task 1: Add the access-code security primitive

**Files:**
- Create: `lib/access-code.ts`
- Test: `lib/access-code.test.ts`

**Interfaces:**
- Produces `validateAccessCode(value: string): string | null`.
- Produces `hashAccessCode(code: string): Promise<string>` and `verifyAccessCode(code: string, encoded: string): Promise<boolean>`.

- [ ] **Step 1: Write failing tests** for a trimmed valid 12-character code, an 11-character rejection, a 129-character rejection, a non-plaintext hash, a matching verification, and a mismatched verification.
- [ ] **Step 2: Run** `node --experimental-strip-types --test lib/access-code.test.ts` and confirm the missing module failure.
- [ ] **Step 3: Implement** the three exported functions with a random 16-byte salt, Node `crypto.scrypt` using `N: 32768`, `r: 8`, `p: 3`, and timing-safe byte comparison. Store `scrypt$32768$8$3$<salt-base64url>$<digest-base64url>`.
- [ ] **Step 4: Re-run** the test command and confirm all access-code cases pass.

### Task 2: Replace Cloudflare storage with Railway PostgreSQL

**Files:**
- Modify: `db/schema.ts`, `db/index.ts`, `drizzle.config.ts`, `lib/repository.ts`, `package.json`, `vite.config.ts`
- Create: `drizzle/0001_railway_postgres.sql`, `railway.json`

**Interfaces:**
- `getDatabaseUrl(): string` throws without `DATABASE_URL`.
- `findVolunteerByAccess(email: string, code: string): Promise<VolunteerDashboard | null>` returns a dashboard only on verified credentials.

- [ ] **Step 1: Write failing repository/security tests** for a dashboard retrieved with a correct code and no dashboard retrieved with an email alone or wrong code.
- [ ] **Step 2: Run** the affected test command and confirm the old email-only behavior fails the new contract.
- [ ] **Step 3: Convert** tables to PostgreSQL Drizzle definitions. Add `access_code_hash text not null` to `volunteers`; create a migration with all current tables and indexes in PostgreSQL syntax.
- [ ] **Step 4: Replace** D1 `.prepare().bind()` calls with parameterized `postgres` calls. Keep all SQL strings static and pass values as query parameters. Ensure `claimShift` requires a code for an existing volunteer and hashes a code for a new volunteer.
- [ ] **Step 5: Change** `start` to `vinext start`, remove Cloudflare-only runtime imports/plugins, add `postgres`, and add `db:migrate` plus Railway `preDeployCommand`.
- [ ] **Step 6: Re-run** the repository/security tests and inspect the generated migration for `access_code_hash`, foreign keys, and unique indexes.

### Task 3: Close public PII and mutation paths

**Files:**
- Modify: `app/api/site/route.ts`, `app/api/admin/route.ts`, `components/VolunteerApp.tsx`
- Test: `app/api/site/route.test.ts`, `app/api/admin/route.test.ts`

**Interfaces:**
- `POST /api/site` supports `claim`, `mine`, and `cancel` only with JSON bodies.
- Every sensitive route response adds no-store, no-referrer, and nosniff headers.

- [ ] **Step 1: Write failing tests** that assert a GET request cannot return a volunteer dashboard, email-only `mine` fails generically, a wrong-code cancellation does not call the mutation, oversized and malformed JSON fail, and unauthenticated organizer GET/POST returns 401 in production.
- [ ] **Step 2: Run** the route tests and confirm the existing public email lookup fails the privacy contract.
- [ ] **Step 3: Implement** JSON content-type checks, an 8 KiB request-size cap, generic 400/401/404 responses, security response headers, POST-only self-service, and code-gated cancellation.
- [ ] **Step 4: Update** the volunteer client to keep code only in session storage, send it in POST bodies, and clear it on explicit sign-out.
- [ ] **Step 5: Re-run** the route tests and confirm the red-team scenarios pass.

### Task 4: Apply the concise blue-and-orange experience

**Files:**
- Modify: `components/VolunteerApp.tsx`, `components/OrganizerApp.tsx`, `app/globals.css`, `app/layout.tsx`, `lib/event.ts`

- [ ] **Step 1: Write a small component/utility test** for the day-tab labels to ensure the three formatted labels remain compact on narrow screens.
- [ ] **Step 2: Run** that test and confirm it fails before the compact-label helper exists.
- [ ] **Step 3: Replace** the editorial hero and location explanation blocks with short operational labels. Preserve dates, location, time, availability, training type, consent, and accessible form labels.
- [ ] **Step 4: Add** a first-signup access-code field and a `My shifts` email-and-code form. Use direct, short error messages.
- [ ] **Step 5: Change** shared theme tokens to cream, blue, and orange; make every title blue/orange; use black only for body copy. Use a contained non-wrapping date-tab layout with `min-width: 0`, responsive text sizing, and label overflow protection.
- [ ] **Step 6: Re-run** relevant tests and the targeted linter.

### Task 5: Verify, commit, and prepare GitHub/Railway delivery

**Files:**
- Modify: `README.md` if absent, create it with Railway setup: add PostgreSQL, set `DATABASE_URL`, run migration, deploy service.

- [ ] **Step 1: Run** fresh unit tests, targeted lint, and `npm run build`.
- [ ] **Step 2: Start** the production server with a local PostgreSQL `DATABASE_URL` and exercise a signup, correct-code dashboard, rejected email-only lookup, rejected wrong-code cancellation, and cleanup.
- [ ] **Step 3: Run** the text audit for em dashes, assistant boilerplate, listicle headings, and hype phrases; correct findings in visible copy.
- [ ] **Step 4: Commit** the exact validated source to branch `railway-privacy-redesign`.
- [ ] **Step 5: Create** a private GitHub repository named `sccnh-2027-railway`, push the branch, and set its default branch to `main` after merging or pushing the final commit there.
