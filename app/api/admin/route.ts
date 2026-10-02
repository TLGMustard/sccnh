import { NextRequest, NextResponse } from 'next/server';
import { organizerSession } from '@/lib/admin-auth';
import { verifyStoredAccessCode } from '@/lib/access-code';
import { recordAdminAudit, type AdminAuditAction, type AdminAuditOutcome, type AdminAuditTarget } from '@/lib/admin-audit';
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
import { requestNetworkIdentity } from '@/lib/security-key';

export const dynamic = 'force-dynamic';

function reply(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, { status, headers: sensitiveResponseHeaders });
}

type MutationMeta = { action: Exclude<AdminAuditAction, 'login' | 'logout'>; targetType: AdminAuditTarget; targetId: string };

function mutationMeta(body: Record<string, unknown>): MutationMeta | null {
  if (body.action === 'training' || body.action === 'cancel-signups' || body.action === 'delete-volunteer') return { action: body.action, targetType: 'volunteer', targetId: boundedIdentifier(body.volunteerId) ?? '' };
  if (body.action === 'capacity') return { action: body.action, targetType: 'shift', targetId: boundedIdentifier(body.shiftId) ?? '' };
  if (body.action === 'checkin') return { action: body.action, targetType: 'signup', targetId: boundedIdentifier(body.signupId) ?? '' };
  return null;
}

async function audit(meta: MutationMeta, outcome: AdminAuditOutcome, actorIdentifier: string): Promise<boolean> {
  try {
    await recordAdminAudit({ ...meta, outcome, actorIdentifier });
    return true;
  } catch {
    console.error('admin audit write failed');
    return false;
  }
}

export async function GET() {
  const session = await organizerSession();
  if (!session) return reply({ message: 'Organizer sign-in required.' }, 401);
  try {
    return reply(await getAdminSnapshot());
  } catch {
    console.error('admin read failed');
    return reply({ message: 'Organizer data is unavailable.' }, 503);
  }
}

export async function POST(request: NextRequest) {
  let appOrigin: string;
  try {
    appOrigin = getApplicationOrigin(request.nextUrl.origin);
  } catch {
    console.error('security configuration unavailable');
    return reply({ message: 'Service configuration is unavailable.' }, 503);
  }
  if (!requireSameOrigin(request, appOrigin)) return reply({ message: 'Invalid request.' }, 403);
  const parsed = await readJsonRequest(request);
  if (!parsed.ok) return reply({ message: 'Invalid request.' }, parsed.status);
  const body = parsed.value;
  const meta = mutationMeta(body);
  if (!meta) return reply({ message: 'Invalid request.' }, 400);
  const session = await organizerSession();
  const actorIdentifier = session ? `session:${session.sessionId}` : `network:${requestNetworkIdentity(request)}`;
  if (!session) {
    if (!(await audit(meta, 'denied', actorIdentifier))) return reply({ message: 'We could not save that organizer change.' }, 503);
    return reply({ message: 'Organizer sign-in required.' }, 401);
  }
  if (meta.action === 'delete-volunteer') {
    const proof = typeof body.confirmAccessCode === 'string' ? body.confirmAccessCode : '';
    const verified = await verifyStoredAccessCode(proof, process.env.ADMIN_ACCESS_CODE_HASH);
    if (!verified) {
      if (!(await audit(meta, 'denied', actorIdentifier))) return reply({ message: 'We could not save that organizer change.' }, 503);
      return reply({ message: 'Organizer sign-in required.' }, 401);
    }
  }
  try {
    let result: { ok: boolean; message: string };
    if (body.action === 'training') {
      result = await setTraining({
        volunteerId: meta.targetId,
        type: 'general',
        complete: Boolean(body.complete),
        completedBy: 'Organizer',
      });
    } else if (body.action === 'capacity') {
      result = await updateCapacity(meta.targetId, Number(body.capacity));
    } else if (body.action === 'checkin') {
      result = await setCheckedIn(meta.targetId, Boolean(body.checkedIn));
    } else if (body.action === 'cancel-signups') {
      result = await cancelVolunteerSignups(meta.targetId);
    } else if (body.action === 'delete-volunteer') {
      result = await deleteVolunteer(meta.targetId);
    } else {
      return reply({ message: 'Invalid request.' }, 400);
    }
    if (!(await audit(meta, result.ok ? 'success' : 'rejected', actorIdentifier))) return reply({ message: 'We could not save that organizer change.' }, 503);
    return reply(result, result.ok ? 200 : 409);
  } catch {
    await audit(meta, 'error', actorIdentifier);
    console.error('admin mutation failed');
    return reply({ message: 'We could not save that organizer change.' }, 503);
  }
}
