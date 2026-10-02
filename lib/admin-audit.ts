import { randomUUID } from 'node:crypto';
import { execute } from '../db/index.ts';
import { keyedDigest } from './security-key.ts';

export type AdminAuditAction = 'login' | 'logout' | 'training' | 'capacity' | 'checkin' | 'cancel-signups' | 'delete-volunteer';
export type AdminAuditOutcome = 'success' | 'denied' | 'rejected' | 'error';
export type AdminAuditTarget = 'session' | 'volunteer' | 'shift' | 'signup';

const ACTIONS = new Set<AdminAuditAction>(['login', 'logout', 'training', 'capacity', 'checkin', 'cancel-signups', 'delete-volunteer']);
const OUTCOMES = new Set<AdminAuditOutcome>(['success', 'denied', 'rejected', 'error']);
const TARGETS = new Set<AdminAuditTarget>(['session', 'volunteer', 'shift', 'signup']);

export type AdminAuditRecord = {
  id: string;
  action: AdminAuditAction;
  targetType: AdminAuditTarget;
  targetId: string;
  actorKey: string;
  outcome: AdminAuditOutcome;
  createdAt: number;
};

export function buildAuditRecord(input: {
  action: AdminAuditAction;
  outcome: AdminAuditOutcome;
  targetType: AdminAuditTarget;
  targetId: string;
  actorIdentifier: string;
  secret: string;
  createdAt?: number;
  id?: string;
}): AdminAuditRecord {
  if (!ACTIONS.has(input.action)) throw new Error('Invalid organizer audit action.');
  if (!OUTCOMES.has(input.outcome)) throw new Error('Invalid organizer audit outcome.');
  if (!TARGETS.has(input.targetType)) throw new Error('Invalid organizer audit target.');
  return {
    id: input.id ?? randomUUID(),
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId.slice(0, 128),
    actorKey: keyedDigest('admin-audit-actor', input.actorIdentifier, input.secret),
    outcome: input.outcome,
    createdAt: input.createdAt ?? Date.now(),
  };
}

export async function recordAdminAudit(input: Omit<Parameters<typeof buildAuditRecord>[0], 'secret' | 'createdAt' | 'id'>): Promise<void> {
  const record = buildAuditRecord({ ...input, secret: process.env.RATE_LIMIT_SECRET ?? '' });
  await execute('INSERT INTO admin_audit_log (id, action, target_type, target_id, actor_key, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [record.id, record.action, record.targetType, record.targetId, record.actorKey, record.outcome, record.createdAt]);
}
