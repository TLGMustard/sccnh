import { NextRequest, NextResponse } from 'next/server';
import {
  cancelSignup,
  claimShift,
  getPublicSnapshot,
  getVolunteerDashboard,
} from '@/lib/repository';

export const dynamic = 'force-dynamic';

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function GET(request: NextRequest) {
  try {
    const mode = request.nextUrl.searchParams.get('mode');
    if (mode === 'mine') {
      const email = request.nextUrl.searchParams.get('email') ?? '';
      return NextResponse.json({ dashboard: await getVolunteerDashboard(email) });
    }
    return NextResponse.json(await getPublicSnapshot());
  } catch (error) {
    console.error('public site read failed', error);
    return NextResponse.json(
      { message: 'Live availability is temporarily unavailable. Please refresh in a moment.' },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === 'claim') {
      const result = await claimShift({
        shiftId: textValue(body.shiftId),
        firstName: textValue(body.firstName),
        lastName: textValue(body.lastName),
        email: textValue(body.email),
        phone: textValue(body.phone),
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 409 });
    }
    if (body.action === 'cancel') {
      const result = await cancelSignup(textValue(body.signupId), textValue(body.email));
      return NextResponse.json(result, { status: result.ok ? 200 : 404 });
    }
    return NextResponse.json({ message: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('public site mutation failed', error);
    return NextResponse.json({ message: 'We could not save that change. Please try again.' }, { status: 503 });
  }
}
