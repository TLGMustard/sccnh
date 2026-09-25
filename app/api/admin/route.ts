import { NextRequest, NextResponse } from 'next/server';
import { isOrganizer } from '@/lib/admin-auth';
import {
  getAdminSnapshot,
  setCheckedIn,
  setTraining,
  updateCapacity,
} from '@/lib/repository';
import { isDeclaredJsonBodyTooLarge, parseJsonRequest, sensitiveResponseHeaders } from '@/lib/request-security';

export const dynamic = 'force-dynamic';

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

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
  if (isDeclaredJsonBodyTooLarge(request.headers.get('content-length'))) return reply({ message: 'Invalid request.' }, 413);
  const parsed = parseJsonRequest(request.headers.get('content-type'), await request.text());
  if (!parsed.ok) return reply({ message: 'Invalid request.' }, parsed.status);
  try {
    const body = parsed.value;
    let result: { ok: boolean; message: string };
    if (body.action === 'training') {
      result = await setTraining({
        volunteerId: textValue(body.volunteerId),
        type: body.type === 'lead' ? 'lead' : 'general',
        complete: Boolean(body.complete),
        completedBy: user.displayName,
      });
    } else if (body.action === 'capacity') {
      result = await updateCapacity(textValue(body.shiftId), Number(body.capacity));
    } else if (body.action === 'checkin') {
      result = await setCheckedIn(textValue(body.signupId), Boolean(body.checkedIn));
    } else {
      return reply({ message: 'Invalid request.' }, 400);
    }
    return reply(result, result.ok ? 200 : 409);
  } catch (error) {
    console.error('admin mutation failed', error);
    return reply({ message: 'We could not save that organizer change.' }, 503);
  }
}
