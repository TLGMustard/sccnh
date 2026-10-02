import { NextRequest, NextResponse } from 'next/server';
import { isOrganizer } from '@/lib/admin-auth';
import {
  cancelVolunteerSignups,
  deleteVolunteer,
  getAdminSnapshot,
  setCheckedIn,
  setTraining,
  updateCapacity,
} from '@/lib/repository';
import { readJsonRequest, requireSameOrigin, sensitiveResponseHeaders } from '@/lib/request-security';
import { getApplicationOrigin } from '@/lib/app-config';
import { boundedIdentifier } from '@/lib/signup-profile';

export const dynamic = 'force-dynamic';

function reply(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, { status, headers: sensitiveResponseHeaders });
}

async function organizer() {
  if (process.env.NODE_ENV === 'development') {
    return { displayName: 'Local organizer', email: 'local@sccnh.test' };
  }
  return (await isOrganizer()) ? { displayName: 'Organizer', email: '' } : null;
}

export async function GET() {
  const user = await organizer();
  if (!user) return reply({ message: 'Organizer sign-in required.' }, 401);
  try {
    return reply(await getAdminSnapshot());
  } catch (error) {
    console.error('admin read failed', error);
    return reply({ message: 'Organizer data is unavailable.' }, 503);
  }
}

export async function POST(request: NextRequest) {
  const user = await organizer();
  if (!user) return reply({ message: 'Organizer sign-in required.' }, 401);
  let appOrigin: string;
  try {
    appOrigin = getApplicationOrigin(request.nextUrl.origin);
  } catch (error) {
    console.error('security configuration unavailable', error instanceof Error ? error.message : 'Invalid application origin');
    return reply({ message: 'Service configuration is unavailable.' }, 503);
  }
  if (!requireSameOrigin(request, appOrigin)) return reply({ message: 'Invalid request.' }, 403);
  const parsed = await readJsonRequest(request);
  if (!parsed.ok) return reply({ message: 'Invalid request.' }, parsed.status);
  try {
    const body = parsed.value;
    let result: { ok: boolean; message: string };
    if (body.action === 'training') {
      result = await setTraining({
        volunteerId: boundedIdentifier(body.volunteerId) ?? '',
        type: 'general',
        complete: Boolean(body.complete),
        completedBy: user.displayName,
      });
    } else if (body.action === 'capacity') {
      result = await updateCapacity(boundedIdentifier(body.shiftId) ?? '', Number(body.capacity));
    } else if (body.action === 'checkin') {
      result = await setCheckedIn(boundedIdentifier(body.signupId) ?? '', Boolean(body.checkedIn));
    } else if (body.action === 'cancel-signups') {
      result = await cancelVolunteerSignups(boundedIdentifier(body.volunteerId) ?? '');
    } else if (body.action === 'delete-volunteer') {
      result = await deleteVolunteer(boundedIdentifier(body.volunteerId) ?? '');
    } else {
      return reply({ message: 'Invalid request.' }, 400);
    }
    return reply(result, result.ok ? 200 : 409);
  } catch (error) {
    console.error('admin mutation failed', error);
    return reply({ message: 'We could not save that organizer change.' }, 503);
  }
}
