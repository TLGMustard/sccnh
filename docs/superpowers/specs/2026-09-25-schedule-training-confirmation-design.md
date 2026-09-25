# SCCNH schedule, training, and confirmation design

## Goal

Update the SCCNH 2027 volunteer experience so the published schedule matches operations, signup collects the required contact and lead-interest data, training completion is enforced at check-in, and every successful reservation can produce a useful email receipt.

## Volunteer experience

The signup sheet keeps the existing private access-code flow. Phone becomes required. A new optional checkbox asks whether the volunteer wants to be a site lead. The checkbox is an expression of interest only; it does not change shift eligibility or imply appointment.

After a successful reservation, the page confirms the reservation immediately. The server then attempts to send a receipt with the shift date, time, location, training reminder, clothing instructions, and a link back to the site. The receipt never contains the volunteer's access code. A mail-provider failure does not undo the reservation and returns a clear warning that the shift was saved but the receipt could not be sent.

## Schedule

- Turlington Plaza and Plaza of the Americas offer 30-minute tabling shifts from 8:00 AM through 6:00 PM on Wednesday, January 27, 2027.
- The medical-school site, currently represented by HPNP Courtyard, offers one-hour shifts from 9:00 AM through 5:00 PM.
- Law school is not published as a location and no law-school shifts are seeded.
- Existing Greek-house and bagging activities remain unchanged.
- Set-up and clean-up remain ordinary volunteer tasks and do not require a separate lead training.

The seed process must reconcile an existing Railway database with the current schedule. Obsolete managed shifts become inactive rather than being deleted, preserving historical or already-linked signup rows. Public and organizer schedule queries show active shifts only.

## Training and clothing

There is one required 1.5-hour SCCNH training. Volunteers may reserve shifts before completing it. The organizer view shows training status, and check-in is rejected until general training is marked complete. Site-lead interest is handled separately: the VC of Ops contacts interested volunteers.

Volunteer-facing clothing guidance is: “Bring your SCCNH shirt. Event shirts are provided at training.” The site removes references to layers and lead training.

## Organizer experience

The organizer volunteer list shows phone, site-lead interest, and general-training completion. Lead-training controls and labels are removed. When an organizer tries to check in a volunteer without completed training, the API returns a specific error and leaves the signup unchanged.

## Email delivery

Railway uses Resend through its HTTPS API with two secrets:

- `RESEND_API_KEY`
- `EMAIL_FROM`

`APP_BASE_URL` supplies the safe return link in the receipt. The email module is isolated behind a small delivery function so another provider can replace Resend without changing signup logic. Delivery errors are logged without printing access codes or request bodies.

## Data changes

- Add `volunteers.wants_site_lead` as a non-null boolean with a default of false.
- Add `shifts.is_active` as a non-null boolean with a default of true.
- Keep the existing general-training record type for compatibility, but stop creating or displaying lead-training records.
- Advance the managed seed version and use upserts so copy, task requirements, shift hours, capacities, and active status update on existing databases.

## Validation and privacy

- First name, last name, valid email, valid phone, and a 12-to-128-character access code are required for a new signup.
- Existing volunteers must still provide the correct access code.
- Lead-interest input is converted strictly to a boolean.
- Email addresses remain out of URLs and public responses.
- Email receipts exclude access codes and organizer-only data.
- Existing request-size, rate-limit, no-cache, and signed-organizer-session protections remain.

## Interface and visual rules

The current compact blue-and-orange system remains. All display headings use blue or orange. Black is reserved for body copy and field content. The signup sheet adds only the required phone field, site-lead checkbox, and short training/clothing consent copy; it does not restore long explanatory sections.

## Testing

Tests are written before implementation for:

- the 8:00 AM–6:00 PM campus schedule;
- the 9:00 AM–5:00 PM one-hour medical schedule;
- absence of law-school locations and shifts;
- required phone and normalized site-lead preference;
- receipt content excluding access codes;
- failed email delivery preserving the reservation result;
- training-required check-in rejection;
- active-shift filtering and seed reconciliation behavior where practical;
- existing access-code, malformed-input, cache, forgery, and rate-limit checks.

The complete test suite and production build must pass before the change is committed.
