import { NextRequest, NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  getAdminSnapshot,
  setCheckedIn,
  setTraining,
  updateCapacity,
} from '@/lib/repository';

export const dynamic = 'force-dynamic';

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function organizer() {
  if (process.env.NODE_ENV === 'development') {
    return { displayName: 'Local organizer', email: 'local@sccnh.test' };
  }
  return getChatGPTUser();
}

export async function GET() {
  const user = await organizer();
  if (!user) return NextResponse.json({ message: 'Organizer sign-in required.' }, { status: 401 });
  try {
    return NextResponse.json(await getAdminSnapshot());
  } catch (error) {
    console.error('admin read failed', error);
    return NextResponse.json({ message: 'Organizer data is temporarily unavailable.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const user = await organizer();
  if (!user) return NextResponse.json({ message: 'Organizer sign-in required.' }, { status: 401 });
  try {
    const body = (await request.json()) as Record<string, unknown>;
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
      return NextResponse.json({ message: 'Unknown action.' }, { status: 400 });
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    console.error('admin mutation failed', error);
    return NextResponse.json({ message: 'We could not save that organizer change.' }, { status: 503 });
  }
}
