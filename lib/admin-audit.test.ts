import assert from 'node:assert/strict';
import test from 'node:test';
import * as audit from './admin-audit.ts';

const secret = 'r'.repeat(32);

void test('builds a redacted organizer audit record', () => {
  const build = (audit as unknown as { buildAuditRecord?: (input: Record<string, unknown>) => Record<string, unknown> }).buildAuditRecord;
  assert.equal(typeof build, 'function');
  if (!build) return;

  const record = build({
    action: 'delete-volunteer',
    outcome: 'success',
    targetType: 'volunteer',
    targetId: 'v'.repeat(180),
    actorIdentifier: 'session-person@example.com-3525550100-OrganizerCode!',
    secret,
    createdAt: 1_800_000_000_000,
    id: 'audit-id',
  });
  assert.deepEqual(Object.keys(record).sort(), ['action', 'actorKey', 'createdAt', 'id', 'outcome', 'targetId', 'targetType']);
  assert.equal(record.targetId, 'v'.repeat(128));
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /person@example\.com|3525550100|OrganizerCode/);
  assert.match(String(record.actorKey), /^[A-Za-z0-9_-]{43}$/);
});

void test('rejects unknown audit actions and outcomes', () => {
  const build = (audit as unknown as { buildAuditRecord?: (input: Record<string, unknown>) => Record<string, unknown> }).buildAuditRecord;
  assert.equal(typeof build, 'function');
  if (!build) return;
  const common = { targetType: 'volunteer', targetId: 'id', actorIdentifier: 'session', secret };
  assert.throws(() => build({ ...common, action: 'export-secrets', outcome: 'success' }));
  assert.throws(() => build({ ...common, action: 'training', outcome: 'maybe' }));
});
