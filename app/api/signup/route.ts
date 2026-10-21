import { NextRequest, NextResponse } from 'next/server';
import { browserCookieName, browserManagementKey, BROWSER_SESSION_SECONDS, newBrowserToken, validBrowserToken } from '@/lib/browser-signup';
import { cancelBrowserSignup, changeBrowserSignup, claimBrowserShifts, getBrowserDashboard } from '@/lib/repository';
import { getApplicationOrigin } from '@/lib/app-config';
import { normalizeEmail } from '@/lib/domain';
import { boundedIdentifier } from '@/lib/signup-profile';
import { consumeRateLimit } from '@/lib/rate-limit';
import { requestNetworkIdentity } from '@/lib/security-key';
import { readJsonRequest, requireSameOrigin, sensitiveResponseHeaders } from '@/lib/request-security';
import { sendAppsScriptConfirmation } from '@/lib/apps-script-confirmation';

export const dynamic = 'force-dynamic';
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: sensitiveResponseHeaders });
const text = (value: unknown) => typeof value === 'string' ? value : '';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(browserCookieName())?.value;
  if (!validBrowserToken(token)) return reply({ dashboard: { shifts: [] } });
  try { return reply({ dashboard: await getBrowserDashboard(browserManagementKey(token)) }); }
  catch { console.error('browser signup read failed'); return reply({ message: 'Your shifts could not be loaded.' }, 503); }
}

export async function POST(request: NextRequest) {
  try {
    if (!requireSameOrigin(request, getApplicationOrigin(request.nextUrl.origin))) return reply({ message: 'Invalid request.' }, 403);
    const parsed = await readJsonRequest(request);
    if (!parsed.ok) return reply({ message: 'Invalid request.' }, parsed.status);
    const body = parsed.value;
    const action = text(body.action);
    if (!['claim', 'cancel', 'change'].includes(action)) return reply({ message: 'Invalid request.' }, 400);
    const previous = request.cookies.get(browserCookieName())?.value;
    if (body.action !== 'claim' && !validBrowserToken(previous)) return reply({ message: 'Open My shifts in the browser used to book.' }, 401);
    const token = validBrowserToken(previous) ? previous : newBrowserToken();
    const key = browserManagementKey(token);
    const identity = body.action === 'claim' ? normalizeEmail(text(body.email)) || 'invalid' : key;
    const limits = await Promise.all([
      consumeRateLimit({ scope: `browser-${action}`, limit: body.action === 'claim' ? 12 : 40, windowMs: 15 * 60_000 }, identity),
      consumeRateLimit({ scope: 'browser-write-network', limit: 600, windowMs: 15 * 60_000 }, requestNetworkIdentity(request)),
    ]);
    if (limits.some((limit) => !limit.allowed)) return reply({ message: 'Please wait before trying again.' }, 429);
    if (body.action === 'claim') {
      const result = await claimBrowserShifts({ firstName: text(body.firstName), lastName: text(body.lastName), email: text(body.email), phone: text(body.phone), wantsSiteLead: body.wantsSiteLead === true, shiftIds: body.shiftIds, consent: body.consent }, key);
      if (!result.ok) return reply(result, result.code === 'invalid_input' ? 400 : 409);
      const delivery = await sendAppsScriptConfirmation({ ...result.receipt, appOrigin: getApplicationOrigin(request.nextUrl.origin) });
      const message = delivery.delivered
        ? 'Shifts saved. Confirmation email sent. View them in My shifts on this browser.'
        : 'Shifts saved. We could not send the confirmation email. View them in My shifts on this browser.';
      const response = reply({ ok: true, message, receipt: delivery.delivered ? 'sent' : 'failed' });
      response.cookies.set(browserCookieName(), token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: BROWSER_SESSION_SECONDS });
      return response;
    }
    const signupId = boundedIdentifier(body.signupId);
    if (!signupId) return reply({ message: 'Invalid request.' }, 400);
    if (body.action === 'cancel') {
      const ok = await cancelBrowserSignup(signupId, key);
      return reply({ ok, message: ok ? 'Shift cancelled.' : 'That shift could not be found in this browser.' }, ok ? 200 : 404);
    }
    const target = boundedIdentifier(body.targetShiftId);
    if (!target) return reply({ message: 'Invalid request.' }, 400);
    const result = await changeBrowserSignup(signupId, target, key);
    return reply(result, result.ok ? 200 : 409);
  } catch { console.error('browser signup action failed'); return reply({ message: 'We could not save this change. Check My shifts before trying again.' }, 503); }
}
