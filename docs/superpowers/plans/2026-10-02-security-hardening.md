# SCCNH Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the account-squatting, rate-limit, concurrency, request-boundary, organizer-session, dependency, and browser-security gaps found in the October 2026 red-team review while keeping the live Railway signup service available.

**Architecture:** Keep public route handlers thin. Put byte-limited request parsing, origin checks, signed proof/session tokens, keyed identifiers, and email composition in tested library modules. Use PostgreSQL for single-use email verification, shared throttles, audit history, and row-locked reservations. Roll out email verification behind one explicit Railway flag so the hardened code can deploy before email becomes a signup dependency.

**Tech Stack:** TypeScript, React 19.3, Vinext 1.0.1, Vite 8.3.2, PostgreSQL, Drizzle ORM, Node test runner, Resend HTTPS API, Railway.

**Spec:** `docs/superpowers/specs/2026-10-02-security-hardening-design.md`

## Global Constraints

- Preserve all current schedule, capacity, training, change-shift, check-in, and organizer-removal behavior unless a step below explicitly hardens it.
- Never put an email address, phone number, volunteer access code, organizer code, verification code, or full request body in a URL, log, rate-limit key, or audit row.
- Do not weaken salted scrypt storage or the existing generic forged-cancellation responses.
- Email verification applies before the first volunteer record is created. It never replaces an existing volunteer's access code.
- Every state-changing browser request must be same-origin and JSON.
- Every sensitive response remains `Cache-Control: no-store, private`.
- Database changes are additive and backward-compatible. Do not drop or rewrite live volunteer data.
- `EMAIL_VERIFICATION_REQUIRED` stays `false` through the first deployment and changes to `true` only after a controlled inbox receives and confirms a code.
- Do not run integration tests against the production `DATABASE_URL`.
- Do not print Railway secret values during setup or verification.

## Review Focus

- A missing volunteer row and a wrong code for an existing row must execute the same scrypt path.
- Forged `X-Forwarded-For` values must not be the only key protecting any endpoint.
- The streaming body reader must stop after 8,192 bytes even without `Content-Length`.
- The first-signup verification proof must be bound to the normalized email and expire after 15 minutes.
- The claim transaction must lock the shift before counting occupied seats.
- A failed replacement claim must leave the volunteer's original shift intact.
- Organizer logout must clear the same cookie name and path used at login.
- Organizer deletion must require fresh code proof and create a redacted audit row.
- CSP changes must not break Vinext hydration, organizer navigation, or API calls.
- The dependency upgrade must preserve `shadcn/tailwind.css` at build time while excluding the CLI from production installs.

---

## Planned File Structure

```text
app/api/admin/route.ts                    organizer authorization, mutations, audit calls
app/api/admin/session/route.ts            login and logout
app/api/site/route.ts                     public schedule and volunteer actions
app/api/verification/route.ts             request and confirm email codes
components/OrganizerApp.tsx               logout and delete reauthentication UI
components/VolunteerApp.tsx               first-signup email verification step
db/schema.ts                               three additive security tables
drizzle-postgres/0002_security_hardening.sql
integration/security.integration.test.ts  PostgreSQL race and shared-limit tests
lib/access-code.ts                         fixed dummy-hash verification path
lib/admin-audit.ts                         redacted mutation/login audit writes
lib/admin-session.ts                       four-hour signed session claims
lib/app-config.ts                          canonical application origin validation
lib/email-provider.ts                      shared Resend transport
lib/email-verification.ts                  code digest and signed proof primitives
lib/email-verification.test.ts
lib/rate-limit.ts                          PostgreSQL-backed atomic counters
lib/rate-limit.test.ts
lib/request-security.ts                    streaming JSON reader and origin guard
lib/request-security.test.ts
lib/repository.ts                          row-locked claims and capacity changes
lib/security-key.ts                        keyed, non-PII identifier digests
lib/security-key.test.ts
lib/signup-verification-state.ts           volunteer verification UI state machine
lib/signup-verification-state.test.ts
lib/signup-profile.ts                      explicit field bounds
next.config.ts                             browser security headers
scripts/security-smoke.ts                  local or staging HTTP assertions
```

### Task 1: Upgrade the vulnerable production stack

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Keeps the existing `npm run dev`, `npm run build`, and `npm start` commands.
- Moves only the `shadcn` command-line/build package to `devDependencies`; `@shadcn/react` remains a production dependency.

- [ ] **Step 1: Record the failing security baseline**

Run:

```bash
npm test
npm run build
npm audit --omit=dev --audit-level=moderate
```

Expected: tests and build pass; the audit reports the currently known React Server Components, Vinext/image-size, Vite, and transitive command-line advisories.

- [ ] **Step 2: Install one compatible patched set**

Run exactly:

```bash
npm install --save-exact react@19.3.0 react-dom@19.3.0 react-server-dom-webpack@19.3.0 vinext@1.0.1
npm install --save-dev --save-exact @types/react@19.3.0 @types/react-dom@19.3.0 @vitejs/plugin-rsc@0.5.35 vite@8.3.2 @cloudflare/vite-plugin@1.62.5 wrangler@4.147.0 shadcn@4.18.0
```

Then remove `shadcn` from `dependencies` if npm leaves a duplicate entry. Confirm `@shadcn/react` is unchanged.

- [ ] **Step 3: Verify production dependency closure**

Run:

```bash
npm ls react react-dom react-server-dom-webpack vinext vite image-size shadcn undici
npm audit --omit=dev --audit-level=moderate
npm test
npm run build
```

Expected: React packages resolve to 19.3.0, Vinext to 1.0.1, Vite to 8.3.2, `shadcn` is dev-only, the production audit exits zero, and tests/build pass. If the audit still finds a production advisory, stop and update the directly responsible package rather than running an unreviewed `npm audit fix --force`.

- [ ] **Step 4: Commit the dependency boundary**

```bash
git add package.json package-lock.json
git commit -m "Upgrade vulnerable web dependencies"
```

### Task 2: Enforce bounded input, canonical origin, and browser headers

**Files:**
- Modify: `lib/request-security.ts`
- Modify: `lib/request-security.test.ts`
- Create: `lib/app-config.ts`
- Create: `lib/app-config.test.ts`
- Modify: `lib/signup-profile.ts`
- Modify: `lib/signup-profile.test.ts`
- Modify: `next.config.ts`
- Modify: `app/api/site/route.ts`
- Modify: `app/api/admin/route.ts`
- Modify: `app/api/admin/session/route.ts`

**Interfaces:**
- Replaces `isDeclaredJsonBodyTooLarge()` plus `request.text()` with `readJsonRequest(request)`.
- Adds `requireSameOrigin(request, expectedOrigin)` and `getApplicationOrigin()`.
- Does not change successful JSON response shapes.

- [ ] **Step 1: Write failing stream, origin, and configuration tests**

Add tests that construct real `Request` objects:

```ts
void test('stops a chunked body after 8192 bytes', async () => {
  const request = new Request('https://creamcheese.up.railway.app/api/site', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://creamcheese.up.railway.app' },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"'));
        controller.enqueue(new Uint8Array(8192).fill(120));
        controller.enqueue(new TextEncoder().encode('"}'));
        controller.close();
      },
    }),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  assert.deepEqual(await readJsonRequest(request), { ok: false, status: 413 });
});

void test('rejects a foreign browser origin', () => {
  const request = new Request('https://creamcheese.up.railway.app/api/site', {
    method: 'POST', headers: { origin: 'https://attacker.example' },
  });
  assert.equal(requireSameOrigin(request, 'https://creamcheese.up.railway.app'), false);
});

void test('requires a configured HTTPS production origin', () => {
  assert.throws(() => resolveApplicationOrigin('', 'https://forged.example', true));
  assert.throws(() => resolveApplicationOrigin('http://creamcheese.up.railway.app', '', true));
  assert.equal(resolveApplicationOrigin('https://creamcheese.up.railway.app/path', '', true), 'https://creamcheese.up.railway.app');
});
```

Also add profile cases for a name longer than 80 characters, email longer than 254 bytes, phone longer than 32 characters, phone with more than 15 digits, and an identifier longer than 128 characters.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --experimental-strip-types --test lib/request-security.test.ts lib/app-config.test.ts lib/signup-profile.test.ts
```

Expected: FAIL because the streaming reader, origin helpers, and new limits do not exist.

- [ ] **Step 3: Implement the 8 KiB streaming reader**

Replace route-level `request.text()` calls with this behavior in `lib/request-security.ts`:

```ts
export async function readJsonRequest(request: Request): Promise<JsonRequestResult> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return { ok: false, status: 415 };
  }
  const declared = request.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_JSON_BYTES) {
    return { ok: false, status: 413 };
  }
  if (!request.body) return { ok: false, status: 400 };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return parseJsonRequest(request.headers.get('content-type'), new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
```

Catch fatal UTF-8 decoding and return status 400. Keep `parseJsonRequest()` exported for direct unit tests.

- [ ] **Step 4: Implement canonical-origin and same-origin helpers**

Create `lib/app-config.ts` with:

```ts
export function resolveApplicationOrigin(configured: string, requestOrigin: string, production: boolean): string {
  const candidate = configured || (!production ? requestOrigin : '');
  const parsed = new URL(candidate);
  if (production && parsed.protocol !== 'https:') throw new Error('APP_BASE_URL must be an HTTPS origin.');
  if (parsed.username || parsed.password) throw new Error('APP_BASE_URL must not include credentials.');
  return parsed.origin;
}

export function getApplicationOrigin(requestOrigin = ''): string {
  return resolveApplicationOrigin(process.env.APP_BASE_URL ?? '', requestOrigin, process.env.NODE_ENV === 'production');
}
```

Add `requireSameOrigin()` to `lib/request-security.ts`. It must compare `new URL(origin).origin` exactly to the configured origin and reject `Sec-Fetch-Site: cross-site`. In production, a missing `Origin` on a mutation is rejected. Tests may pass `production = false` explicitly for local command-line requests.

- [ ] **Step 5: Apply exact field limits**

In `lib/signup-profile.ts`, normalize first, then enforce:

```ts
const NAME_MAX = 80;
const EMAIL_MAX_BYTES = 254;
const PHONE_MAX = 32;
const PHONE_DIGITS_MIN = 7;
const PHONE_DIGITS_MAX = 15;
```

Reject ASCII control characters in names and phone. Keep Unicode names. Export `boundedIdentifier(value)` for shift/signup/volunteer IDs and accept only 1 to 128 characters from `[A-Za-z0-9:_-]`.

- [ ] **Step 6: Refactor all three POST route handlers**

For `app/api/site/route.ts`, `app/api/admin/route.ts`, and `app/api/admin/session/route.ts`:

1. Resolve the configured app origin.
2. Reject foreign-origin requests with 403.
3. Call `await readJsonRequest(request)` exactly once.
4. Remove every `await request.text()` and `isDeclaredJsonBodyTooLarge()` call.
5. Pass every record identifier through `boundedIdentifier()` before repository use.

Do not apply origin checks to public GET requests.

- [ ] **Step 7: Add global security headers**

Set `next.config.ts` to return headers for `/:path*`:

```ts
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; upgrade-insecure-requests" },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  async headers() { return [{ source: '/:path*', headers: securityHeaders }]; },
};
```

Vinext 1.0.1 supports `next.config` headers; verify this again in the live-header task.

- [ ] **Step 8: Verify and commit**

Run:

```bash
npm test
npm run build
```

Expected: PASS.

```bash
git add lib/request-security.ts lib/request-security.test.ts lib/app-config.ts lib/app-config.test.ts lib/signup-profile.ts lib/signup-profile.test.ts next.config.ts app/api/site/route.ts app/api/admin/route.ts app/api/admin/session/route.ts
git commit -m "Harden request and browser boundaries"
```

### Task 3: Remove timing disclosure and fail-open organizer access

**Files:**
- Modify: `lib/access-code.ts`
- Modify: `lib/access-code.test.ts`
- Modify: `lib/repository.ts`
- Modify: `lib/admin-session.ts`
- Modify: `lib/admin-session.test.ts`
- Modify: `lib/admin-auth.ts`
- Modify: `app/api/admin/route.ts`
- Modify: `app/api/admin/session/route.ts`
- Modify: `components/OrganizerApp.tsx`

**Interfaces:**
- Adds `verifyStoredAccessCode(code, storedHash | null)` which always calls scrypt for a syntactically valid code.
- Changes `readAdminSession()` from boolean to signed claims `{ sessionId, issuedAt, expiresAt } | null`.
- Adds `DELETE /api/admin/session` and a visible organizer logout button.

- [ ] **Step 1: Write failing constant-work and session tests**

Add:

```ts
void test('uses a valid dummy hash when a credential row is absent', async () => {
  assert.equal(await verifyStoredAccessCode('correct-length-code', null), false);
  assert.equal(await verifyStoredAccessCode('correct-length-code', DUMMY_ACCESS_CODE_HASH), false);
});

void test('round trips bounded four-hour organizer claims', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const token = createAdminSession('a'.repeat(32), { sessionId: 'session-1', issuedAt: now, expiresAt: now + 4 * 60 * 60_000 });
  assert.deepEqual(readAdminSession(token, 'a'.repeat(32), now), { sessionId: 'session-1', issuedAt: now, expiresAt: now + 4 * 60 * 60_000 });
  assert.equal(readAdminSession(token, 'a'.repeat(32), now + 4 * 60 * 60_000), null);
});
```

Add a test that the production cookie name is `__Host-sccnh_admin`, while local development uses `sccnh_admin` so an HTTP local browser can still sign in.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --experimental-strip-types --test lib/access-code.test.ts lib/admin-session.test.ts
```

Expected: FAIL for the new exports and claims shape.

- [ ] **Step 3: Add the fixed dummy verification path**

In `lib/access-code.ts`, export a valid, deterministic encoded hash built from fixed-size zero buffers:

```ts
export const DUMMY_ACCESS_CODE_HASH = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(DIGEST_BYTES).toString('base64url')}`;

export async function verifyStoredAccessCode(code: string, storedHash: string | null | undefined): Promise<boolean> {
  const matched = await verifyAccessCode(code, storedHash || DUMMY_ACCESS_CODE_HASH);
  return Boolean(storedHash) && matched;
}
```

Change `volunteerWithAccess()` and organizer login to call `verifyStoredAccessCode()`. Do not query-return before the scrypt call when the normalized email and access-code shape are valid.

- [ ] **Step 4: Harden organizer session claims and cookies**

Use token format `sccnh-admin-v2.issuedAt.expiresAt.sessionId.signature`, HMAC-SHA-256, and `timingSafeEqual`. Reject secrets shorter than 32 characters and sessions longer than four hours. Generate `sessionId` with `randomBytes(18).toString('base64url')`.

In production, set:

```ts
{
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
  maxAge: 4 * 60 * 60,
}
```

Use `__Host-sccnh_admin` only when `NODE_ENV === 'production'`; use `sccnh_admin` locally.

- [ ] **Step 5: Remove the development bypass and add logout**

Delete this branch from `app/api/admin/route.ts`:

```ts
if (process.env.NODE_ENV === 'development') {
  return { displayName: 'Local organizer', email: 'local@sccnh.test' };
}
```

Make local development use `.env.local` values. Add `DELETE /api/admin/session`, enforce same origin, clear the cookie with `maxAge: 0`, and return `{ ok: true }` with sensitive headers. Add a “Sign out” button in `OrganizerApp.tsx` that calls the endpoint, clears organizer data, and shows the login form.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test
npm run build
```

```bash
git add lib/access-code.ts lib/access-code.test.ts lib/repository.ts lib/admin-session.ts lib/admin-session.test.ts lib/admin-auth.ts app/api/admin/route.ts app/api/admin/session/route.ts components/OrganizerApp.tsx
git commit -m "Harden access verification and organizer sessions"
```

### Task 4: Add additive security tables and database constraints

**Files:**
- Modify: `db/schema.ts`
- Create: `drizzle-postgres/0002_security_hardening.sql`
- Modify: `drizzle-postgres/meta/_journal.json`
- Create or modify: `drizzle-postgres/meta/0002_snapshot.json`

**Interfaces:**
- Adds `email_verifications`, `security_rate_limits`, and `admin_audit_log`.
- Existing application tables and rows remain intact.

- [ ] **Step 1: Define the three tables in Drizzle**

Use `bigint` with `{ mode: 'number' }` for epoch milliseconds:

```ts
export const emailVerifications = pgTable('email_verifications', {
  id: text('id').primaryKey(),
  emailKey: text('email_key').notNull(),
  codeDigest: text('code_digest').notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  consumedAt: bigint('consumed_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
}, (table) => [index('idx_email_verifications_key_created').on(table.emailKey, table.createdAt)]);

export const securityRateLimits = pgTable('security_rate_limits', {
  bucketKey: text('bucket_key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
}, (table) => [index('idx_security_rate_limits_expiry').on(table.expiresAt)]);

export const adminAuditLog = pgTable('admin_audit_log', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  actorKey: text('actor_key').notNull(),
  outcome: text('outcome').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});
```

- [ ] **Step 2: Generate the named migration**

Run:

```bash
npm run db:generate -- --name security_hardening
```

Expected: `drizzle-postgres/0002_security_hardening.sql` plus matching journal/snapshot changes.

- [ ] **Step 3: Add non-validating defense-in-depth constraints**

Append these statements to the generated migration:

```sql
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_email_length" CHECK (octet_length("email") <= 254) NOT VALID;
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_first_name_length" CHECK (char_length("first_name") BETWEEN 1 AND 80) NOT VALID;
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_last_name_length" CHECK (char_length("last_name") BETWEEN 1 AND 80) NOT VALID;
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_phone_length" CHECK (char_length("phone") BETWEEN 1 AND 32) NOT VALID;
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_access_hash_length" CHECK (char_length("access_code_hash") <= 256) NOT VALID;
```

`NOT VALID` preserves deployability if a legacy row is malformed while enforcing the constraints on new and updated rows.

- [ ] **Step 4: Test migration against a disposable PostgreSQL database**

Run with a local/staging-only URL:

```bash
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
```

Expected: both runs succeed; the second is idempotent. Confirm the three new tables exist and the live-table row counts are unchanged in the disposable copy.

- [ ] **Step 5: Commit the schema**

```bash
git add db/schema.ts drizzle-postgres
git commit -m "Add security state and audit tables"
```

### Task 5: Replace memory throttles with shared keyed PostgreSQL limits

**Files:**
- Create: `lib/security-key.ts`
- Create: `lib/security-key.test.ts`
- Create: `lib/rate-limit.ts`
- Create: `lib/rate-limit.test.ts`
- Modify: `app/api/site/route.ts`
- Modify: `app/api/admin/session/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Adds `keyedDigest(scope, value, secret)` and `consumeRateLimit(policy, identity)`.
- Removes `createRateLimiter()` from public and organizer routes.

- [ ] **Step 1: Write failing keyed-identity and bucket tests**

Test that:

- equal normalized identifiers produce equal keys;
- changing scope changes the key;
- the raw email and IP never appear in the key;
- a secret shorter than 32 characters is rejected;
- bucket keys change at the configured window boundary;
- forwarded IP input is not used as the sole identity for volunteer or organizer limits.

Use a pure helper shape:

```ts
assert.equal(rateBucketStart(899_999, 900_000), 0);
assert.equal(rateBucketStart(900_000, 900_000), 900_000);
assert.doesNotMatch(keyedDigest('mine', 'person@example.com', 's'.repeat(32)), /person@example\.com/);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --experimental-strip-types --test lib/security-key.test.ts lib/rate-limit.test.ts
```

- [ ] **Step 3: Implement atomic database counters**

`consumeRateLimit()` must:

1. HMAC the normalized identity with `RATE_LIMIT_SECRET`.
2. Include the action scope and numeric window start in `bucket_key`.
3. use the following atomic statement:

```sql
INSERT INTO security_rate_limits (bucket_key, count, expires_at)
VALUES ($1, 1, $2)
ON CONFLICT (bucket_key)
DO UPDATE SET count = security_rate_limits.count + 1,
              expires_at = EXCLUDED.expires_at
RETURNING count;
```

4. return `allowed: count <= limit` and `retryAfterSeconds`;
5. delete expired buckets after the decision with `DELETE FROM security_rate_limits WHERE expires_at < $1`.

Never interpolate user input into SQL.

- [ ] **Step 4: Apply layered policies**

Use these exact initial policies:

| Action | Primary key | Limit |
|---|---|---|
| `request-verification` | normalized email digest | 3 per 15 minutes |
| `request-verification` secondary | request-network digest | 20 per hour |
| `request-verification` global | constant `verification-send` | 500 per hour |
| `confirm-verification` | normalized email digest | 8 per 15 minutes |
| `mine`, `cancel`, `change` | normalized email digest | 8 per 15 minutes |
| `claim` | normalized email digest | 12 per 15 minutes |
| organizer login | request-network digest | 8 per 15 minutes |
| organizer login global | constant `organizer-login` | 60 per 15 minutes |

For network identity, use a dedicated helper that takes only the rightmost syntactically valid `X-Forwarded-For` value supplied by Railway's immediate proxy, falls back to `x-real-ip`, and finally uses `unknown`. Treat that key as secondary. The email/action or global key remains the non-bypassable control.

- [ ] **Step 5: Add configuration and failure behavior**

Add `RATE_LIMIT_SECRET=` to `.env.example`. In production, a missing/short secret must make sensitive POST actions return 503 and log only `security configuration unavailable`. Do not silently fall back to the in-memory limiter.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test
npm run build
```

```bash
git add lib/security-key.ts lib/security-key.test.ts lib/rate-limit.ts lib/rate-limit.test.ts app/api/site/route.ts app/api/admin/session/route.ts .env.example
git commit -m "Share abuse limits through PostgreSQL"
```

### Task 6: Require email ownership before the first signup

**Files:**
- Create: `lib/email-provider.ts`
- Modify: `lib/confirmation-email.ts`
- Modify: `lib/confirmation-email.test.ts`
- Create: `lib/email-verification.ts`
- Create: `lib/email-verification.test.ts`
- Create: `lib/verification-repository.ts`
- Create: `lib/verification-email.ts`
- Create: `app/api/verification/route.ts`
- Modify: `lib/repository.ts`
- Modify: `app/api/site/route.ts`
- Modify: `.env.example`

**Interfaces:**
- `POST /api/verification` accepts `{ action: 'request', email }` or `{ action: 'confirm', email, code }`.
- Confirmation sets a short-lived HTTP-only email proof cookie; no proof token is returned in JSON.
- `claim` requires matching proof only when the normalized email has no volunteer row and enforcement is enabled.

- [ ] **Step 1: Write failing primitive tests**

Cover:

```ts
void test('verification codes are six digits and stored as keyed digests', () => {
  const code = createVerificationCode(() => 42_319);
  assert.equal(code, '042319');
  const digest = digestVerificationCode('request-1', code, 'v'.repeat(32));
  assert.doesNotMatch(digest, /042319/);
  assert.equal(verifyVerificationCode('request-1', code, digest, 'v'.repeat(32)), true);
});

void test('email proof is bound to email digest and 15-minute expiry', () => {
  const now = 1_800_000_000_000;
  const token = createEmailProof({ emailKey: 'email-key', issuedAt: now, expiresAt: now + 15 * 60_000 }, 'v'.repeat(32));
  assert.equal(readEmailProof(token, 'email-key', 'v'.repeat(32), now + 14 * 60_000)?.emailKey, 'email-key');
  assert.equal(readEmailProof(token, 'other-key', 'v'.repeat(32), now), null);
  assert.equal(readEmailProof(token, 'email-key', 'v'.repeat(32), now + 15 * 60_000), null);
});
```

Add tests for wrong code, sixth failed attempt, consumed request, expired request, malformed token, and timing-safe equal-length comparison.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --experimental-strip-types --test lib/email-verification.test.ts lib/confirmation-email.test.ts
```

- [ ] **Step 3: Extract the shared Resend transport**

Move the HTTPS request from `confirmation-email.ts` into `email-provider.ts`:

```ts
export async function sendEmail(message: { to: string; subject: string; text: string; html: string }, config = emailConfigFromEnv()): Promise<void>
```

Keep the existing eight-second timeout, never log the API key or message body, and keep confirmation-receipt failure non-transactional.

- [ ] **Step 4: Implement verification persistence**

`requestEmailVerification(email)` must:

1. normalize and validate the email;
2. consume both email and network rate limits in the route;
3. generate a random six-digit code with `randomInt(0, 1_000_000)`;
4. insert a row with HMAC email key, HMAC code digest, ten-minute expiry, zero attempts, and no raw email;
5. send the code to the raw email supplied for this request;
6. return the same public message whether delivery succeeds or fails.

`confirmEmailVerification(email, code)` must lock the newest live row, increment attempts atomically, compare the digest with `timingSafeEqual`, consume on success, and refuse after six failed attempts.

- [ ] **Step 5: Sign and set the proof cookie**

After confirmation, set a cookie containing only signed version, email HMAC key, issued time, and expiry. Use `__Host-sccnh_email_verified` in production, `sccnh_email_verified` locally, `HttpOnly`, `Secure` in production, `SameSite=Strict`, path `/`, and max age 15 minutes.

Every verification response body is one of:

```json
{ "ok": true, "message": "If that address can receive mail, a code will arrive shortly." }
```

or:

```json
{ "ok": false, "message": "We could not verify that code." }
```

The request response never says whether an account exists.

- [ ] **Step 6: Enforce proof for new volunteers only**

Add `volunteerExists(email)` to `lib/repository.ts`. In the claim route:

```ts
const existing = await volunteerExists(email);
if (!existing && emailVerificationRequired()) {
  const emailKey = keyedDigest('email-verification', email, verificationSecret());
  if (!readEmailProof(cookieValue, emailKey, verificationSecret())) {
    return reply({ ok: false, code: 'email_verification_required', message: 'Verify your email before saving this shift.' }, 403);
  }
}
```

The repository still checks for a newly appeared row inside the claim transaction and requires its access code. Verification proof must never make an existing account accessible.

- [ ] **Step 7: Add safe rollout configuration**

Append to `.env.example`:

```dotenv
EMAIL_VERIFICATION_REQUIRED=false
EMAIL_VERIFICATION_SECRET=
RATE_LIMIT_SECRET=
```

Require `EMAIL_VERIFICATION_SECRET` to be at least 32 characters whenever verification endpoints are used or enforcement is true. Treat only the literal string `true` as enabled.

- [ ] **Step 8: Verify and commit**

Run:

```bash
npm test
npm run build
```

```bash
git add lib/email-provider.ts lib/confirmation-email.ts lib/confirmation-email.test.ts lib/email-verification.ts lib/email-verification.test.ts lib/verification-repository.ts lib/verification-email.ts app/api/verification/route.ts lib/repository.ts app/api/site/route.ts .env.example
git commit -m "Verify email ownership for first signup"
```

### Task 7: Add the email-verification step to the volunteer UI

**Files:**
- Modify: `components/VolunteerApp.tsx`
- Create: `lib/signup-verification-state.ts`
- Create: `lib/signup-verification-state.test.ts`
- Modify: `lib/repository.ts`
- Modify: `app/api/site/route.ts`

**Interfaces:**
- Adds `emailVerificationRequired: boolean` to the public snapshot.
- Does not store the verification code or access code in local storage, session storage, URL parameters, or cookies readable by JavaScript.

- [ ] **Step 1: Add a UI state testable as a pure reducer**

Extract a small reducer or decision helper to `lib/signup-verification-state.ts` with tests covering:

- enforcement off goes directly to claim;
- enforcement on and unverified goes to request-code;
- a confirmed code returns to the pending shift and submits claim;
- changing the email clears verified UI state;
- failed claim with `email_verification_required` reopens verification.

- [ ] **Step 2: Publish only the feature boolean**

Add `emailVerificationRequired` to `PublicSnapshot`. Do not expose provider name, secret status, request IDs, email keys, or verification table data.

- [ ] **Step 3: Implement the two-step form**

When enforcement is on:

1. The volunteer fills the current signup form.
2. “Save shift” calls the verification request endpoint for a new email.
3. The sheet shows one six-digit code field, “Verify email,” “Send another code,” and “Back.”
4. Successful confirmation immediately retries the original claim with the still-in-memory form values.
5. On success, clear the six-digit code state and keep existing dashboard/receipt behavior.

Use `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`, and no third-party scripts.

- [ ] **Step 4: Preserve existing-volunteer behavior**

Existing volunteers still enter email plus access code and claim immediately. If the server returns `access_denied`, show the existing generic message. Do not reveal “account exists.”

- [ ] **Step 5: Run responsive and keyboard checks**

Run the app locally and verify at widths 375, 768, and 1440 pixels:

- verification controls stay inside the shift sheet;
- focus enters the code field after a request;
- Enter submits once;
- status messages use `role="status"` or `role="alert"`;
- Escape/close does not leak form values into the URL.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test
npm run build
```

```bash
git add components/VolunteerApp.tsx lib/signup-verification-state.ts lib/signup-verification-state.test.ts lib/repository.ts app/api/site/route.ts
git commit -m "Add first-signup email verification flow"
```

### Task 8: Serialize reservations and capacity changes

**Files:**
- Modify: `lib/repository.ts`
- Modify: `lib/shift-reservation.ts`
- Modify: `lib/shift-reservation.test.ts`
- Create: `integration/security.integration.test.ts`
- Modify: `package.json`

**Interfaces:**
- Keeps current `claimShift()`, `changeSignup()`, and `updateCapacity()` return types.
- Adds `npm run test:integration`, which requires `TEST_DATABASE_URL`.

- [ ] **Step 1: Add failing concurrent-capacity integration cases**

Create a test-only shift with capacity 3 and launch 20 distinct new verified claim attempts concurrently. Assert exactly three active signups and seventeen `full` results. Add a second case that tries to reduce capacity below the occupied count while a claim is pending and asserts the database never ends with `capacity < occupied`.

At test startup:

```ts
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('TEST_DATABASE_URL is required.');
if (/railway\.app|proxy\.rlwy\.net/i.test(testUrl) && process.env.ALLOW_REMOTE_SECURITY_TESTS !== 'true') {
  throw new Error('Refusing to run integration tests against a remote Railway database.');
}
process.env.DATABASE_URL = testUrl;
```

Use UUID-prefixed rows and delete only those rows during cleanup.

- [ ] **Step 2: Add the integration script and verify RED**

In `package.json`:

```json
"test:integration": "node --experimental-strip-types --test integration/*.integration.test.ts"
```

Run:

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration
```

Expected: the concurrent claim case can expose over-capacity behavior before the lock refactor.

- [ ] **Step 3: Lock the target shift before counting**

Refactor `claimShift()` so all shift checks and signup writes happen in one `getDatabase().begin()` transaction:

```sql
SELECT s.is_active, s.capacity,
  (SELECT COUNT(*) FROM signups occupied
   WHERE occupied.shift_id = s.id
     AND occupied.status IN ('confirmed', 'checked_in')) AS filled
FROM shifts s
WHERE s.id = $1
FOR UPDATE
```

Normalize and hash/verify access input before holding the shift lock where possible. Re-read the volunteer with `FOR UPDATE` inside the transaction to close the unique-email race. Insert/reactivate the signup only after `shiftReservationDecision()` succeeds.

- [ ] **Step 4: Lock capacity changes**

Make `updateCapacity()` begin a transaction, lock the shift row, count active signups under the same lock, reject a value below the occupied count, and then update. Keep the existing 1 to 500 bounds.

- [ ] **Step 5: Preserve shift-change atomicity**

Keep `changeSignup()` transactional. Lock source signup first and target shift second in a consistent order. Add an integration case proving that a full target returns `full` and the original signup remains confirmed.

- [ ] **Step 6: Run all verification and commit**

Run:

```bash
npm test
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration
npm run build
```

```bash
git add lib/repository.ts lib/shift-reservation.ts lib/shift-reservation.test.ts integration/security.integration.test.ts package.json package-lock.json
git commit -m "Serialize shift capacity mutations"
```

### Task 9: Audit organizer actions and reauthenticate deletion

**Files:**
- Create: `lib/admin-audit.ts`
- Create: `lib/admin-audit.test.ts`
- Modify: `lib/admin-auth.ts`
- Modify: `app/api/admin/route.ts`
- Modify: `app/api/admin/session/route.ts`
- Modify: `components/OrganizerApp.tsx`

**Interfaces:**
- Organizer authorization returns session claims, not only a boolean.
- `delete-volunteer` additionally requires `confirmAccessCode`.
- Every login attempt and organizer mutation writes one redacted audit record.

- [ ] **Step 1: Write failing audit-record tests**

Test that `buildAuditRecord()` accepts only enumerated actions/outcomes, hashes the session/request identifier with `RATE_LIMIT_SECRET`, truncates target IDs to 128 characters, and contains none of the supplied email, phone, organizer code, or request body.

- [ ] **Step 2: Implement redacted audit writes**

Allowed actions:

```ts
type AdminAuditAction = 'login' | 'logout' | 'training' | 'capacity' | 'checkin' | 'cancel-signups' | 'delete-volunteer';
type AdminAuditOutcome = 'success' | 'denied' | 'rejected' | 'error';
```

Use the signed session ID digest as `actorKey` after login. For login failures, use the request-network digest. Insert only action, target type, target ID, actor key, outcome, and timestamp.

- [ ] **Step 3: Require fresh organizer proof for deletion**

In the volunteer removal UI, keep the current name confirmation, then show a password input labeled “Organizer access code.” Send it as `confirmAccessCode` only for `delete-volunteer`. The route calls `verifyStoredAccessCode(confirmAccessCode, ADMIN_ACCESS_CODE_HASH)` before deletion. Return the generic 401 message on failure and never log the code.

- [ ] **Step 4: Audit every outcome**

For login, logout, training, capacity, check-in, cancellation, and deletion:

- record `success` after commit;
- record `denied` for authentication or fresh-proof failure;
- record `rejected` for a valid authenticated request refused by a business rule;
- record `error` for an exception, then return the existing generic 503.

Audit failure must be logged server-side. For successful destructive mutations, treat inability to write the audit row as an application error before responding success; where possible, write the mutation and audit row in the same database transaction.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test
npm run build
```

```bash
git add lib/admin-audit.ts lib/admin-audit.test.ts lib/admin-auth.ts app/api/admin/route.ts app/api/admin/session/route.ts components/OrganizerApp.tsx
git commit -m "Audit organizer actions and protect deletion"
```

### Task 10: Run red-team regression, document Railway rollout, and validate live

**Files:**
- Create: `scripts/security-smoke.ts`
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `docs/superpowers/specs/2026-10-02-security-hardening-design.md` only if implementation decisions changed during testing

**Interfaces:**
- `scripts/security-smoke.ts` takes `APP_BASE_URL` and optional test credentials from environment variables; it never prints secrets.
- README becomes the exact deploy/rollback runbook.

- [ ] **Step 1: Add safe HTTP smoke assertions**

The script must assert:

1. `/` and `/admin` return HSTS, CSP, frame denial, no-referrer, MIME denial, and permissions policy.
2. `/api/site` contains no email/phone fields and uses `no-store`.
3. unauthenticated `/api/admin` returns 401 and `no-store`.
4. foreign-origin POSTs to volunteer, verification, and admin session endpoints return 403.
5. malformed JSON returns 400, non-JSON returns 415, declared and chunked oversized bodies return 413.
6. forged cancellation without the matching access code fails generically.
7. repeated lookup and login attempts return 429 without depending on the first `X-Forwarded-For` value.
8. a hostile `Host` header cannot change links generated from `APP_BASE_URL`.

The script must use a dedicated test email and test shift only when `SECURITY_TEST_EMAIL`, `SECURITY_TEST_ACCESS_CODE`, and `SECURITY_TEST_SHIFT_ID` are all present. It must never delete or alter arbitrary production records.

- [ ] **Step 2: Add test cases for the original audit list**

Ensure automated coverage exists for:

- absent/existing email timing path;
- first-signup ownership proof;
- email enumeration response shapes;
- forged cancellation and change;
- unauthorized organizer read/mutation;
- logout cookie clearing;
- deletion reauthentication;
- cross-site mutation;
- caching and security headers;
- oversized/malformed input;
- multiple-instance/shared rate counters;
- concurrent overbooking;
- capacity/claim race;
- confirmation and verification email escaping;
- secret and personal-data absence from logs/audit rows.

- [ ] **Step 3: Run the full local release gate**

Run:

```bash
npm test
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration
npm run lint
npm run build
npm audit --omit=dev --audit-level=moderate
git diff --check
git status --short
```

Expected: every command passes; only intended plan implementation changes appear before the final commit.

- [ ] **Step 4: Document exact Railway variables**

README must list:

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
```

State that the three secrets must be different and that the organizer hash must include the `scrypt$` prefix and every field printed by the hash script. Include this local generation command without printing output into shell history documentation:

```bash
openssl rand -base64 48
```

- [ ] **Step 5: Deploy in the safe order**

1. Create a Railway PostgreSQL backup.
2. Add `RATE_LIMIT_SECRET` and `EMAIL_VERIFICATION_SECRET` as separate secrets.
3. Confirm `APP_BASE_URL` is exactly `https://creamcheese.up.railway.app`.
4. Keep `EMAIL_VERIFICATION_REQUIRED=false`.
5. Deploy the release and let the pre-deploy migration finish.
6. Run `APP_BASE_URL=https://creamcheese.up.railway.app node --experimental-strip-types scripts/security-smoke.ts` without signup test credentials.
7. Confirm organizer login, logout, navigation, training, and a non-destructive capacity rejection.
8. Confirm a verification code reaches a controlled inbox and can be confirmed.
9. Set `EMAIL_VERIFICATION_REQUIRED=true` and redeploy.
10. Complete one controlled new-email signup, view it through My Shifts, change it, cancel it, and remove the test volunteer from Organizer with reauthentication.

- [ ] **Step 6: Inspect privacy and audit output**

Search Railway application logs for the controlled email, phone, access code, and verification code. Expected: none appear. Query the audit table and confirm action/outcome rows exist while personal data and raw session IDs do not.

- [ ] **Step 7: Validate live headers and behavior**

Run:

```bash
curl -sS -D - -o /dev/null https://creamcheese.up.railway.app/
curl -sS -D - -o /dev/null https://creamcheese.up.railway.app/admin
curl -sS -D - -o /dev/null https://creamcheese.up.railway.app/api/site
curl -sS -D - -o /dev/null https://creamcheese.up.railway.app/api/admin
```

Expected: the first three are reachable, anonymous admin is 401, security headers are present, and API responses are non-cacheable. Open the live site and verify Vinext hydration, volunteer tabs, organizer tabs, and forms still work under CSP.

- [ ] **Step 8: Record deferred risk and commit documentation**

README must explicitly defer per-person organizer accounts and application-level PII encryption, and recommend Railway private networking, restricted database credentials, and backups until those projects are scheduled.

```bash
git add scripts/security-smoke.ts README.md .env.example docs/superpowers/specs/2026-10-02-security-hardening-design.md
git commit -m "Document and verify security rollout"
```

### Task 11: Final review and main-branch release

**Files:**
- Review all files changed by Tasks 1 through 10.

- [ ] **Step 1: Review the cumulative diff for secret or scope leakage**

Run:

```bash
git diff main...HEAD --check
git diff main...HEAD -- . ':!package-lock.json' ':!drizzle-postgres/meta/*.json'
git grep -nE '(RESEND_API_KEY|ADMIN_SESSION_SECRET|RATE_LIMIT_SECRET|EMAIL_VERIFICATION_SECRET)=' -- ':!*.example' ':!docs/**'
```

Expected: no whitespace errors, no unexpected schedule/UI changes, and no assigned secret values.

- [ ] **Step 2: Repeat the release gate from a clean checkout**

Run:

```bash
npm ci
npm test
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration
npm run lint
npm run build
npm audit --omit=dev --audit-level=moderate
```

- [ ] **Step 3: Review the highest-risk code paths manually**

Confirm line by line:

- proof cookie cannot authenticate a different email;
- verification code consumption is single-use;
- new-account claim and shift capacity are checked inside transactions;
- existing-account claim still requires scrypt access-code verification;
- admin development bypass is gone;
- delete proof is verified server-side;
- audit and error logs contain no submitted credentials or PII;
- production configuration fails closed when required secrets are missing.

- [ ] **Step 4: Merge and monitor**

Merge only after all checks pass. Watch the first Railway deployment through migration, startup, smoke verification, and the first controlled signup. If verification delivery fails, leave `EMAIL_VERIFICATION_REQUIRED=false`, fix email configuration, and redeploy; do not bypass proof in code.

## Deferred Follow-Up Plans

- Per-person organizer accounts with revocation, MFA, and named audit attribution.
- Application-level encryption for volunteer names, email, and phone with blind email indexes, key versioning, backup recovery, and rotation drills.
- Optional external WAF/bot protection if abuse volume exceeds the database-backed limits.

These are explicitly outside this release because they change identity architecture or encryption/recovery guarantees. All other actionable findings from the October audit are covered above.
