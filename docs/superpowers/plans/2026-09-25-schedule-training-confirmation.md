# SCCNH Schedule, Training, and Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the corrected 2027 schedule, collect required phone and site-lead interest, send safe signup receipts, and require completed training before check-in.

**Architecture:** Keep deterministic event rules, signup normalization, and email composition in small library modules with direct Node tests. Reconcile the Railway PostgreSQL seed using active flags so obsolete shifts disappear without deleting historical signups. The existing route handlers orchestrate database writes, receipt delivery, and organizer actions.

**Tech Stack:** TypeScript, React 19, Vinext, PostgreSQL, Drizzle ORM, Node test runner, Resend HTTPS API, Railway.

**Spec:** `docs/superpowers/specs/2026-09-25-schedule-training-confirmation-design.md`

## Global Constraints

- Turlington Plaza and Plaza of the Americas have 30-minute tabling shifts from 8:00 AM through 6:00 PM on January 27, 2027.
- HPNP Courtyard has one-hour medical-school shifts from 9:00 AM through 5:00 PM.
- No law-school location or shift may be published.
- Phone is required; site-lead interest is optional and does not confer appointment.
- There is one 1.5-hour general training and no lead-training requirement.
- Volunteers may reserve before training but may not be checked in until training is complete.
- Email receipts exclude access codes and do not roll back a successful reservation when delivery fails.
- Headings use blue or orange; black is reserved for body and field text.
- Existing access-code, no-URL-PII, no-cache, malformed-input, organizer-session, and rate-limit protections remain.

## Review Focus

- Existing volunteers with an empty legacy phone must be required to provide and persist a phone on the next reservation.
- A string value such as `"false"` must not become an accidental true site-lead preference.
- The last campus slot must end at 6:00 PM, while the last medical slot must be 4:00–5:00 PM.
- Receipt-provider timeouts or 4xx/5xx responses must return a saved reservation with a delivery warning, never an unhandled signup failure.
- Removing training after a previous check-in must not silently check the volunteer out; the gate applies when changing an un-checked signup to checked in.

---

### Task 1: Correct event schedule and operational copy

**Files:**
- Create: `lib/event.test.ts`
- Modify: `lib/event.ts`

**Interfaces:**
- Consumes: Existing `ShiftSeed`, `LOCATIONS`, `TASKS`, and `SHIFTS` exports.
- Produces: Corrected `EVENT.essentials`, active location seeds, general-training task seeds, and exact 2027 shift seeds for later database reconciliation.

- [ ] **Step 1: Write failing schedule tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { EVENT, LOCATIONS, SHIFTS, TASKS } from './event.ts';

test('campus tabling covers 8 AM through 6 PM in 30-minute blocks', () => {
  for (const locationId of ['turlington', 'plaza']) {
    const shifts = SHIFTS.filter((shift) => shift.locationId === locationId && shift.taskId === 'tabling');
    assert.equal(shifts.length, 20);
    assert.equal(shifts[0].startsAt.slice(11, 16), '08:00');
    assert.equal(shifts.at(-1)?.endsAt.slice(11, 16), '18:00');
    assert.ok(shifts.every((shift) => Date.parse(shift.endsAt) - Date.parse(shift.startsAt) === 30 * 60_000));
  }
});

test('medical school offers eight one-hour shifts from 9 AM through 5 PM', () => {
  const shifts = SHIFTS.filter((shift) => shift.locationId === 'hpnp' && shift.taskId === 'tabling');
  assert.equal(shifts.length, 8);
  assert.equal(shifts[0].startsAt.slice(11, 16), '09:00');
  assert.equal(shifts.at(-1)?.endsAt.slice(11, 16), '17:00');
  assert.ok(shifts.every((shift) => Date.parse(shift.endsAt) - Date.parse(shift.startsAt) === 60 * 60_000));
});

test('publishes no law site and requires only one 1.5-hour training', () => {
  assert.equal(LOCATIONS.some((location) => /law/i.test(location.name)), false);
  assert.equal(SHIFTS.some((shift) => /law/i.test(shift.locationId)), false);
  assert.ok(TASKS.every((task) => task.training === 'general'));
  assert.deepEqual(EVENT.essentials, [
    'Training is 1.5 hours.',
    'Bring your SCCNH shirt. Event shirts are provided at training.',
    'Interested site leads will be contacted by the VC of Ops.',
  ]);
});
```

- [ ] **Step 2: Run the schedule tests and verify RED**

Run: `node --experimental-strip-types --test lib/event.test.ts`

Expected: FAIL because campus hours, medical duration, task training, and essentials still reflect the old operation.

- [ ] **Step 3: Implement the corrected schedule**

In `lib/event.ts`, replace the current half-hour helper with a duration-aware helper:

```ts
function timedShifts(day: string, locationId: string, startHour: number, endHour: number, minutes: 30 | 60, capacity: number): ShiftSeed[] {
  const count = (endHour - startHour) * (60 / minutes);
  return Array.from({ length: count }, (_, index) => {
    const start = startHour * 60 + index * minutes;
    const end = start + minutes;
    return shift(day, locationId, 'tabling', Math.floor(start / 60), start % 60, Math.floor(end / 60), end % 60, capacity);
  });
}
```

Seed Turlington and Plaza with `timedShifts(wednesday, id, 8, 18, 30, capacity)` and HPNP with `timedShifts(wednesday, 'hpnp', 9, 17, 60, 15)`. Keep Greek and bagging shifts. Set every task's `training` to `general`, remove lead-training copy, and set the three exact essentials asserted above.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

Expected: PASS, including the new schedule tests.

```bash
git add lib/event.ts lib/event.test.ts
git commit -m "Correct SCCNH schedule and training copy"
```

### Task 2: Add required phone, site-lead interest, and active seed reconciliation

**Files:**
- Create: `lib/signup-profile.ts`
- Create: `lib/signup-profile.test.ts`
- Modify: `db/schema.ts`
- Modify: `lib/repository.ts`
- Modify: `app/api/site/route.ts`
- Generate: `drizzle-postgres/*.sql`

**Interfaces:**
- Consumes: `normalizeEmail()` and `isValidEmail()` from `lib/domain.ts`.
- Produces: `normalizeSignupProfile(input): { ok: true; value: SignupProfile } | { ok: false; message: string }`, `VolunteerDashboard.volunteer.wantsSiteLead`, `AdminVolunteer.wantsSiteLead`, `volunteers.wants_site_lead`, and `shifts.is_active`.

- [ ] **Step 1: Write failing profile tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSignupProfile } from './signup-profile.ts';

test('requires a usable phone number', () => {
  assert.equal(normalizeSignupProfile({ firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '', wantsSiteLead: false }).ok, false);
  assert.equal(normalizeSignupProfile({ firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '123', wantsSiteLead: false }).ok, false);
});

test('normalizes contact data and accepts only literal true for site-lead interest', () => {
  const result = normalizeSignupProfile({ firstName: ' Ana ', lastName: ' Lee ', email: ' ANA@UFL.EDU ', phone: '(352) 555-0199', wantsSiteLead: 'false' });
  assert.deepEqual(result, { ok: true, value: { firstName: 'Ana', lastName: 'Lee', email: 'ana@ufl.edu', phone: '(352) 555-0199', wantsSiteLead: false } });
  assert.equal(normalizeSignupProfile({ firstName: 'Ana', lastName: 'Lee', email: 'ana@ufl.edu', phone: '352-555-0199', wantsSiteLead: true }).ok, true);
});
```

- [ ] **Step 2: Run the profile tests and verify RED**

Run: `node --experimental-strip-types --test lib/signup-profile.test.ts`

Expected: FAIL because `lib/signup-profile.ts` does not exist.

- [ ] **Step 3: Implement profile normalization**

Create `lib/signup-profile.ts` with a `SignupProfile` type, trim names and phone, normalize email, require at least seven phone digits, and set `wantsSiteLead: input.wantsSiteLead === true`.

- [ ] **Step 4: Run the profile tests and verify GREEN**

Run: `node --experimental-strip-types --test lib/signup-profile.test.ts`

Expected: PASS.

- [ ] **Step 5: Add schema fields and migration**

Add `boolean` from `drizzle-orm/pg-core`, then:

```ts
wantsSiteLead: boolean('wants_site_lead').notNull().default(false)
isActive: boolean('is_active').notNull().default(true)
```

Run: `npm run db:generate`

Expected: a new PostgreSQL migration adding both non-null defaulted columns.

- [ ] **Step 6: Reconcile current seeds and profile fields**

In `lib/repository.ts`:

- Advance `SEED_VERSION` to `sccnh-2027-v3`.
- Before shift upserts, run `UPDATE shifts SET is_active = false`.
- Upsert events, locations, tasks, and shifts with current copy and values; set each current shift `is_active = true`.
- Add `WHERE s.is_active = true` to public/admin shift listing.
- Replace inline signup validation with `normalizeSignupProfile()`.
- Require phone for new and legacy volunteers, persist a provided legacy phone, and persist `wants_site_lead = true` when an existing volunteer newly opts in.
- Add `wantsSiteLead` to volunteer dashboard and admin mappings.
- In `app/api/site/route.ts`, pass `wantsSiteLead: body.wantsSiteLead === true` into `claimShift()`.

- [ ] **Step 7: Run all tests, build, and commit**

Run: `npm test`

Run: `npm run build`

Expected: both PASS.

```bash
git add lib/signup-profile.ts lib/signup-profile.test.ts db/schema.ts lib/repository.ts app/api/site/route.ts drizzle-postgres
git commit -m "Require phone and track site lead interest"
```

### Task 3: Send a safe confirmation receipt after signup

**Files:**
- Create: `lib/confirmation-email.ts`
- Create: `lib/confirmation-email.test.ts`
- Modify: `app/api/site/route.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: successful `claimShift()` result and its selected `VolunteerShift`.
- Produces: `buildShiftConfirmation(input): ConfirmationMessage`, `sendShiftConfirmation(message, config): Promise<void>`, and `attemptShiftConfirmation(send): Promise<boolean>`.

- [ ] **Step 1: Write failing receipt tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { attemptShiftConfirmation, buildShiftConfirmation } from './confirmation-email.ts';

const input = {
  to: 'ana@ufl.edu', firstName: 'Ana', location: 'Turlington Plaza',
  startsAt: '2027-01-27T08:00:00-05:00', endsAt: '2027-01-27T08:30:00-05:00',
  accessCode: 'must-never-appear', appBaseUrl: 'https://signup.example',
};

test('builds a useful receipt without the access code', () => {
  const message = buildShiftConfirmation(input);
  assert.match(message.text, /Turlington Plaza/);
  assert.match(message.text, /1\.5-hour training/);
  assert.match(message.text, /SCCNH shirt/);
  assert.match(message.text, /https:\/\/signup\.example/);
  assert.doesNotMatch(JSON.stringify(message), /must-never-appear/);
});

test('reports delivery failure without throwing away the reservation flow', async () => {
  assert.equal(await attemptShiftConfirmation(async () => { throw new Error('provider unavailable'); }), false);
  assert.equal(await attemptShiftConfirmation(async () => undefined), true);
});
```

- [ ] **Step 2: Run receipt tests and verify RED**

Run: `node --experimental-strip-types --test lib/confirmation-email.test.ts`

Expected: FAIL because the email module does not exist.

- [ ] **Step 3: Implement message composition and Resend delivery**

`buildShiftConfirmation()` returns `{ to, subject, text, html }` and intentionally ignores/removes `accessCode`. `sendShiftConfirmation()` POSTs to `https://api.resend.com/emails` with `Authorization: Bearer ${RESEND_API_KEY}` and throws on a missing configuration, timeout, or non-2xx response. `attemptShiftConfirmation()` catches provider errors, logs only the error class/message, and returns false.

- [ ] **Step 4: Call email delivery after the database commit**

In the claim branch of `app/api/site/route.ts`, after `claimShift()` returns success, find the claimed shift in `result.dashboard.shifts`, build the receipt, attempt delivery, and return:

```ts
{ ...result, receipt: delivered ? 'sent' : 'failed' }
```

The HTTP status remains 200 for both receipt outcomes because the reservation is already saved.

- [ ] **Step 5: Document Railway variables and commit**

Add `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_BASE_URL` to `.env.example` and Railway setup instructions in `README.md`.

Run: `npm test`

Run: `npm run build`

Expected: both PASS.

```bash
git add lib/confirmation-email.ts lib/confirmation-email.test.ts app/api/site/route.ts .env.example README.md
git commit -m "Send private signup confirmation receipts"
```

### Task 4: Require completed training for check-in

**Files:**
- Create: `lib/check-in.ts`
- Create: `lib/check-in.test.ts`
- Modify: `lib/repository.ts`
- Modify: `app/api/admin/route.ts`
- Modify: `components/OrganizerApp.tsx`

**Interfaces:**
- Produces: `checkInDecision(input): { allowed: boolean; message: string }` and organizer data containing each signup's `trainingComplete` flag.
- Consumes: general-training records and the existing `setCheckedIn(signupId, checkedIn)` route action.

- [ ] **Step 1: Write failing check-in decision tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { checkInDecision } from './check-in.ts';

test('blocks a new check-in when general training is incomplete', () => {
  assert.deepEqual(checkInDecision({ checkingIn: true, trainingComplete: false }), { allowed: false, message: 'Complete training before check-in.' });
});

test('allows trained check-in and always allows removing a check-in', () => {
  assert.equal(checkInDecision({ checkingIn: true, trainingComplete: true }).allowed, true);
  assert.equal(checkInDecision({ checkingIn: false, trainingComplete: false }).allowed, true);
});
```

- [ ] **Step 2: Run decision tests and verify RED**

Run: `node --experimental-strip-types --test lib/check-in.test.ts`

Expected: FAIL because `lib/check-in.ts` does not exist.

- [ ] **Step 3: Implement and enforce the decision**

Create the pure decision function. In `setCheckedIn()`, load the signup's volunteer and whether a `general` training row exists, call `checkInDecision()`, and skip the status update when denied. Keep removal allowed even if training was later removed.

- [ ] **Step 4: Simplify organizer training UI**

Remove `'lead'` from `AdminAction`, the lead-training table column, and lead toggles. Add a Site lead column that displays “Interested” from `wantsSiteLead`. Add `trainingComplete` to each `AdminSignup` and disable untrained check-in buttons with a “Training required” label.

- [ ] **Step 5: Run tests, build, and commit**

Run: `npm test`

Run: `npm run build`

Expected: both PASS.

```bash
git add lib/check-in.ts lib/check-in.test.ts lib/repository.ts app/api/admin/route.ts components/OrganizerApp.tsx
git commit -m "Require training before volunteer check-in"
```

### Task 5: Update volunteer form, headings, and completion messaging

**Files:**
- Modify: `components/VolunteerApp.tsx`
- Modify: `app/globals.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: `wantsSiteLead`, `receipt`, corrected event essentials, and training status from prior tasks.
- Produces: required phone input, lead-interest checkbox, concise consent copy, receipt status feedback, and blue/orange heading presentation.

- [ ] **Step 1: Extend the form state and request**

Add `wantsSiteLead: boolean` to `Contact`, initialize it false, make Phone required, and render:

```tsx
<label className="lead-choice">
  <input type="checkbox" checked={contact.wantsSiteLead} onChange={(event) => setContact({ ...contact, wantsSiteLead: event.target.checked })} />
  <span><strong>Interested in being a site lead</strong><small>The VC of Ops will contact selected leads.</small></span>
</label>
```

The existing spread into the claim request carries the boolean. Replace the clothing/training paragraph with: “Training is 1.5 hours. Bring your SCCNH shirt. Event shirts are provided at training.”

- [ ] **Step 2: Display precise receipt status**

Extend the response type with `receipt?: 'sent' | 'failed'`. Show “Shift saved. Check your email for confirmation.” when sent, and “Shift saved. We could not send the email receipt.” when delivery fails.

- [ ] **Step 3: Enforce heading colors and compact styling**

Add a scoped heading rule so `h1`–`h3` and display headings default to `var(--blue)`, while `.title-orange` and text on blue/orange backgrounds remain explicit exceptions. Style `.lead-choice` as a compact bordered row with an accessible native checkbox and preserve black only for body/field content.

- [ ] **Step 4: Audit removed copy and configuration**

Run: `rg -n "lead training|Lead training|layers|law school|Law School|phone \(optional\)|Phone \(optional\)" app components lib README.md`

Expected: no volunteer-facing matches. Database compatibility references to legacy `lead` training may remain only where explicitly necessary and must not render.

- [ ] **Step 5: Run final verification and commit**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run build`

Expected: production build PASS.

Run: `git diff --check`

Expected: no whitespace errors.

```bash
git add components/VolunteerApp.tsx app/globals.css README.md
git commit -m "Finish SCCNH volunteer signup updates"
```

### Task 6: Final security and deployment review

**Files:**
- Modify if required by findings: `README.md`, `railway.json`, route or library files already listed above.

**Interfaces:**
- Consumes: the complete feature branch.
- Produces: a verified Railway-ready commit with documented secrets and no newly exposed personal data.

- [ ] **Step 1: Re-run the security-focused tests**

Run: `node --experimental-strip-types --test lib/access-code.test.ts lib/admin-session.test.ts lib/request-security.test.ts lib/confirmation-email.test.ts lib/check-in.test.ts`

Expected: PASS for hash storage, forged sessions, cache headers, malformed/oversized bodies, rate limiting, email redaction, delivery failure, and check-in gating.

- [ ] **Step 2: Inspect PII and secret boundaries**

Run: `rg -n "searchParams|[?&]email=|localStorage|accessCode.*console|console.*accessCode|RESEND_API_KEY" app components lib README.md`

Expected: no email/access-code URL construction, no browser persistence of credentials, no credential logging, and the Resend key used only as an environment variable in the mail transport.

- [ ] **Step 3: Verify migrations and deployment files**

Run: `npm run db:generate`

Expected: “No schema changes” after the committed migration.

Run: `npm test && npm run build && git status --short`

Expected: tests and build PASS; only intentional review fixes, if any, remain.

- [ ] **Step 4: Commit review fixes if needed**

```bash
git add README.md railway.json app components lib db drizzle-postgres
git commit -m "Complete Railway deployment review"
```
