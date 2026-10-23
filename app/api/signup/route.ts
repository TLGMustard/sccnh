import { NextRequest, NextResponse } from 'next/server';
import { selectedShiftIds } from '@/lib/browser-signup';
import { accountForSession, authenticateAccount, discardUnusedAccount, type Account } from '@/lib/account-repository';
import { accountCookieName, ACCOUNT_SESSION_SECONDS, normalizePhone, verifyPhone } from '@/lib/volunteer-account';
import { getDatabase } from '@/db/index';
import { cancelBrowserSignup, changeBrowserSignup, claimBrowserShifts, getBrowserDashboard } from '@/lib/repository';
import { getApplicationOrigin } from '@/lib/app-config';
import { normalizeEmail } from '@/lib/domain';
import { boundedIdentifier, normalizeSignupProfile } from '@/lib/signup-profile';
import { consumeRateLimit } from '@/lib/rate-limit';
import { requestNetworkIdentity } from '@/lib/security-key';
import { readJsonRequest, requireSameOrigin, sensitiveResponseHeaders } from '@/lib/request-security';
import { sendAppsScriptConfirmation } from '@/lib/apps-script-confirmation';

export const dynamic = 'force-dynamic';
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: sensitiveResponseHeaders });
const text = (value: unknown) => typeof value === 'string' ? value : '';

export async function GET(request: NextRequest) {
  try {
    const account = await accountForSession(request.cookies.get(accountCookieName())?.value);
    if (!account) return reply({ signedIn: false, dashboard: { shifts: [] } });
    const [profile] = await getDatabase().unsafe<{ first_name: string; last_name: string; phone: string }[]>('SELECT first_name, last_name, phone FROM volunteers WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1', [account.id]);
    return reply({ signedIn: true, profile: { firstName: profile?.first_name ?? '', lastName: profile?.last_name ?? '', email: account.email, phone: profile?.phone ?? '' }, dashboard: await getBrowserDashboard(account.management_key) });
  }
  catch { console.error('browser signup read failed'); return reply({ message: 'Your shifts could not be loaded.' }, 503); }
}

export async function POST(request: NextRequest) {
  let provisionalAccount: Account | undefined;
  try {
    if (!requireSameOrigin(request, getApplicationOrigin(request.nextUrl.origin))) return reply({ message: 'Invalid request.' }, 403);
    const parsed = await readJsonRequest(request);
    if (!parsed.ok) return reply({ message: 'Invalid request.' }, parsed.status);
    const body = parsed.value;
    const action = text(body.action);
    if (!['claim', 'cancel', 'change'].includes(action)) return reply({ message: 'Invalid request.' }, 400);
    let account = await accountForSession(request.cookies.get(accountCookieName())?.value);
    if (body.action !== 'claim' && !account) return reply({ message: 'Sign in to manage your shifts.' }, 401);
    const identity = body.action === 'claim' ? normalizeEmail(text(body.email)).slice(0, 254) || 'invalid' : account!.id;
    const limits = await Promise.all([
      consumeRateLimit({ scope: `browser-${action}`, limit: body.action === 'claim' ? 12 : 40, windowMs: 15 * 60_000 }, identity),
      consumeRateLimit({ scope: 'browser-write-network', limit: 600, windowMs: 15 * 60_000 }, requestNetworkIdentity(request)),
    ]);
    if (limits.some((limit) => !limit.allowed)) return reply({ message: 'Please wait before trying again.' }, 429);
    if (body.action === 'claim') {
      const profile = normalizeSignupProfile({ firstName: text(body.firstName), lastName: text(body.lastName), email: text(body.email), phone: text(body.phone), wantsSiteLead: false });
      if (!profile.ok || !normalizePhone(body.phone) || !selectedShiftIds(body.shiftIds) || body.consent !== true) return reply({ message: !profile.ok ? profile.message : 'Enter your phone number, select shifts, and accept the volunteer consent.' }, 400);
      let token: string | undefined;
      if (!account) {
        const login = await authenticateAccount(profile.value.email, profile.value.phone, true);
        if (!login) return reply({ message: 'Email and phone number could not be verified. Use the details from your signup.' }, 401);
        account = login.account; token = login.token;
        if (login.created) provisionalAccount = account;
      } else {
        const [credential] = await getDatabase().unsafe<{ phone_hash: string }[]>('SELECT phone_hash FROM volunteer_accounts WHERE id = $1', [account.id]);
        if (account.email !== profile.value.email || !await verifyPhone(profile.value.phone, credential?.phone_hash)) return reply({ message: 'Use the email and phone number you signed in with.' }, 400);
      }
      const result = await claimBrowserShifts({ ...profile.value, shiftIds: body.shiftIds, consent: body.consent }, account.management_key, account.id);
      if (!result.ok) {
        if (provisionalAccount) await discardUnusedAccount(provisionalAccount);
        return reply(result, result.code === 'invalid_input' ? 400 : 409);
      }
      provisionalAccount = undefined;
      const delivery = await sendAppsScriptConfirmation({ ...result.receipt, appOrigin: getApplicationOrigin(request.nextUrl.origin) });
      const message = delivery.delivered
        ? 'Shifts saved. Confirmation email sent.'
        : 'Shifts saved. We could not send the confirmation email.';
      const response = reply({ ok: true, message, receipt: delivery.delivered ? 'sent' : 'failed' });
      if (token) response.cookies.set(accountCookieName(), token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: ACCOUNT_SESSION_SECONDS });
      return response;
    }
    const signupId = boundedIdentifier(body.signupId);
    if (!signupId) return reply({ message: 'Invalid request.' }, 400);
    if (body.action === 'cancel') {
      const ok = await cancelBrowserSignup(signupId, account!.management_key);
      return reply({ ok, message: ok ? 'Shift cancelled.' : 'That shift could not be found.' }, ok ? 200 : 404);
    }
    const target = boundedIdentifier(body.targetShiftId);
    if (!target) return reply({ message: 'Invalid request.' }, 400);
    const result = await changeBrowserSignup(signupId, target, account!.management_key);
    return reply(result, result.ok ? 200 : 409);
  } catch {
    if (provisionalAccount) await discardUnusedAccount(provisionalAccount).catch(() => undefined);
    console.error('browser signup action failed'); return reply({ message: 'We could not save this change. Check My shifts before trying again.' }, 503);
  }
}
