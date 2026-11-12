/**
 * Phase 5 (Module 23) — Super Admin & Audit: data layer + services.
 *
 * Covers lib/super-admin.ts, lib/services/audit-access-service.ts,
 * lib/db/audit.ts getAuditLogFiltered, lib/db/users.ts getUsersByIds,
 * and the SessionUser canViewAuditLog wiring. No live database — the
 * in-memory fake db stands in (see tests/fake-db.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSuperAdmin, isSuperAdminEmail } from '../lib/super-admin';
import { getAuditLog, getAuditLogFiltered } from '../lib/db/audit';
import { getUserById, getUsersByIds } from '../lib/db/users';
import { toSessionUser } from '../lib/services/auth-service';
import {
  grantAuditAccess,
  listAuditAccessUsers,
  revokeAuditAccess,
} from '../lib/services/audit-access-service';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';

let fake: FakeDb;

const OFFICIAL_1 = 'mhateemjutt1412@gmail.com';
const OFFICIAL_2 = 'ahmad.hassan.hnd@gmail.com';

function seedUser(id: string, role: string, extra: Record<string, unknown> = {}) {
  fake.seed('User', [
    {
      id,
      name: `User ${id}`,
      email: `${id}@example.com`,
      passwordHash: '$2b$12$dummyhashdummyhashdummyhashdummyhashdummyhashdummyha',
      role,
      status: 'active',
      joinedAt: new Date('2024-01-01'),
      ...extra,
    },
  ]);
}

function seedAuditRows() {
  fake.seed('AuditLog', [
    { id: 'a1', actorId: 'admin-1', action: 'admin.access.grant', entity: 'user', entityId: 'u1', detail: 'one', ip: null, createdAt: new Date('2026-01-01T10:00:00.000Z') },
    { id: 'a2', actorId: 'admin-1', action: 'admin.access.revoke', entity: 'user', entityId: 'u2', detail: 'two', ip: null, createdAt: new Date('2026-01-02T10:00:00.000Z') },
    { id: 'a3', actorId: 'admin-2', action: 'admin.access.grant', entity: 'user', entityId: 'u3', detail: 'three', ip: null, createdAt: new Date('2026-01-03T10:00:00.000Z') },
    { id: 'a4', actorId: 'admin-1', action: 'course.create', entity: 'course', entityId: 'c1', detail: 'four', ip: null, createdAt: new Date('2026-01-04T10:00:00.000Z') },
    { id: 'a5', actorId: null, action: 'auth.login', entity: 'session', entityId: null, detail: 'five', ip: null, createdAt: new Date('2026-01-05T10:00:00.000Z') },
  ]);
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedUser('official-1', 'admin', { email: OFFICIAL_1, isAdmin: true });
  seedUser('official-2', 'admin', { email: OFFICIAL_2, isAdmin: true });
  seedUser('admin-1', 'admin', { isAdmin: true });
  seedUser('admin-2', 'admin', { isAdmin: true, canViewAuditLog: true });
  seedUser('student-1', 'student');
  seedUser('suspended-admin', 'admin', { status: 'suspended', isAdmin: true });
});

test.afterEach(() => {
  __resetDbClient();
});

// ---------------------------------------------------------------------------
// lib/super-admin.ts
// ---------------------------------------------------------------------------

test('isSuperAdminEmail matches the two officials, case-insensitively', () => {
  assert.equal(isSuperAdminEmail(OFFICIAL_1), true);
  assert.equal(isSuperAdminEmail('MHATEEMJUTT1412@GMAIL.COM'), true);
  assert.equal(isSuperAdminEmail(`  ${OFFICIAL_2}  `), true);
  assert.equal(isSuperAdminEmail('admin-1@example.com'), false);
  assert.equal(isSuperAdminEmail(''), false);
});

test('isSuperAdmin is false for null/undefined users and users without an email', () => {
  assert.equal(isSuperAdmin(null), false);
  assert.equal(isSuperAdmin(undefined), false);
  assert.equal(isSuperAdmin({}), false);
  assert.equal(isSuperAdmin({ email: null }), false);
  assert.equal(isSuperAdmin({ email: OFFICIAL_1 }), true);
  assert.equal(isSuperAdmin({ email: 'admin-1@example.com' }), false);
});

// ---------------------------------------------------------------------------
// grantAuditAccess / revokeAuditAccess
// ---------------------------------------------------------------------------

test('grant: official grants an admin audit access and it is audit-logged', async () => {
  const result = await grantAuditAccess('official-1', 'admin-1');
  assert.ok(!('error' in result));
  assert.equal(result.user.canViewAuditLog, true);

  const stored = await getUserById('admin-1');
  assert.equal(stored?.canViewAuditLog, true);

  const entries = await getAuditLog();
  const grant = entries.find((e) => e.action === 'admin.audit-access.grant');
  assert.ok(grant);
  assert.equal(grant.actorId, 'official-1');
  assert.equal(grant.entity, 'user');
  assert.equal(grant.entityId, 'admin-1');
  assert.match(grant.detail ?? '', /admin-1@example\.com/);
});

test('grant is idempotent: granting an already-granted admin succeeds without a second audit entry', async () => {
  const first = await grantAuditAccess('official-1', 'admin-1');
  assert.ok(!('error' in first));
  const second = await grantAuditAccess('official-1', 'admin-1');
  assert.ok(!('error' in second));
  assert.equal(second.user.canViewAuditLog, true);

  const grants = (await getAuditLog()).filter((e) => e.action === 'admin.audit-access.grant');
  assert.equal(grants.length, 1);
});

test('grant: non-official actors are refused (full admin, student, unknown actor)', async () => {
  const byFullAdmin = await grantAuditAccess('admin-1', 'admin-2');
  assert.ok('error' in byFullAdmin);
  assert.equal(byFullAdmin.status, 403);

  const byStudent = await grantAuditAccess('student-1', 'admin-1');
  assert.ok('error' in byStudent);
  assert.equal(byStudent.status, 403);

  const byNobody = await grantAuditAccess('nobody', 'admin-1');
  assert.ok('error' in byNobody);
  assert.equal(byNobody.status, 404);
});

test('grant: non-admin target, suspended target and unknown target are refused', async () => {
  const student = await grantAuditAccess('official-1', 'student-1');
  assert.ok('error' in student);
  assert.equal(student.status, 400);

  const suspended = await grantAuditAccess('official-1', 'suspended-admin');
  assert.ok('error' in suspended);
  assert.equal(suspended.status, 400);

  const missing = await grantAuditAccess('official-1', 'nobody');
  assert.ok('error' in missing);
  assert.equal(missing.status, 404);
});

test('grant: granting an official is a no-op success (no write, no audit entry)', async () => {
  const before = await getAuditLog();
  const result = await grantAuditAccess('official-1', 'official-2');
  assert.ok(!('error' in result));
  assert.equal(result.user.email, OFFICIAL_2);
  // Officials have access without the flag — the flag stays false.
  assert.equal(result.user.canViewAuditLog, false);
  const after = await getAuditLog();
  assert.equal(after.length, before.length);
});

test('revoke: official revokes a granted admin and it is audit-logged', async () => {
  const result = await revokeAuditAccess('official-1', 'admin-2');
  assert.ok(!('error' in result));
  assert.equal(result.user.canViewAuditLog, false);

  const stored = await getUserById('admin-2');
  assert.equal(stored?.canViewAuditLog, false);

  const entries = await getAuditLog();
  const revoke = entries.find((e) => e.action === 'admin.audit-access.revoke');
  assert.ok(revoke);
  assert.equal(revoke.actorId, 'official-1');
  assert.equal(revoke.entityId, 'admin-2');
});

test('revoke: official target cannot be revoked by anyone, and non-official actors are refused', async () => {
  const official = await revokeAuditAccess('official-1', 'official-2');
  assert.ok('error' in official);
  assert.equal(official.status, 403);

  const byFullAdmin = await revokeAuditAccess('admin-1', 'admin-2');
  assert.ok('error' in byFullAdmin);
  assert.equal(byFullAdmin.status, 403);
});

test('revoke: revoking an admin without the flag is a no-op success; revoking a non-admin without it is refused', async () => {
  const admin = await revokeAuditAccess('official-1', 'admin-1');
  assert.ok(!('error' in admin));
  assert.equal(admin.user.canViewAuditLog, false);

  const student = await revokeAuditAccess('official-1', 'student-1');
  assert.ok('error' in student);
  assert.equal(student.status, 400);

  const missing = await revokeAuditAccess('official-1', 'nobody');
  assert.ok('error' in missing);
  assert.equal(missing.status, 404);
});

// ---------------------------------------------------------------------------
// listAuditAccessUsers
// ---------------------------------------------------------------------------

test('listAuditAccessUsers: officials and granted admins, split; non-officials refused', async () => {
  const result = await listAuditAccessUsers('official-1');
  assert.ok(!('error' in result));
  assert.deepEqual(
    result.officials.map((u) => u.email).sort(),
    [OFFICIAL_1, OFFICIAL_2].sort(),
  );
  assert.deepEqual(result.granted.map((u) => u.id), ['admin-2']);

  const denied = await listAuditAccessUsers('admin-1');
  assert.ok('error' in denied);
  assert.equal(denied.status, 403);
});

// ---------------------------------------------------------------------------
// getAuditLogFiltered
// ---------------------------------------------------------------------------

test('getAuditLogFiltered: no filters returns everything, newest first, with total', async () => {
  seedAuditRows();
  const { entries, total } = await getAuditLogFiltered();
  assert.equal(total, 5);
  assert.deepEqual(entries.map((e) => e.id), ['a5', 'a4', 'a3', 'a2', 'a1']);
});

test('getAuditLogFiltered: filters by actor, action and entity', async () => {
  seedAuditRows();
  const byActor = await getAuditLogFiltered({ actorId: 'admin-1' });
  assert.equal(byActor.total, 3);
  assert.deepEqual(byActor.entries.map((e) => e.id), ['a4', 'a2', 'a1']);

  const byAction = await getAuditLogFiltered({ action: 'admin.access.grant' });
  assert.equal(byAction.total, 2);
  assert.deepEqual(byAction.entries.map((e) => e.id), ['a3', 'a1']);

  const byEntity = await getAuditLogFiltered({ entity: 'course' });
  assert.equal(byEntity.total, 1);
  assert.equal(byEntity.entries[0].id, 'a4');

  const combined = await getAuditLogFiltered({ actorId: 'admin-1', action: 'admin.access.grant' });
  assert.equal(combined.total, 1);
  assert.equal(combined.entries[0].id, 'a1');
});

test('getAuditLogFiltered: from/to date range is inclusive', async () => {
  seedAuditRows();
  const from = await getAuditLogFiltered({ from: '2026-01-03T00:00:00.000Z' });
  assert.equal(from.total, 3);
  assert.deepEqual(from.entries.map((e) => e.id), ['a5', 'a4', 'a3']);

  const to = await getAuditLogFiltered({ to: '2026-01-02T10:00:00.000Z' });
  assert.equal(to.total, 2);
  assert.deepEqual(to.entries.map((e) => e.id), ['a2', 'a1']);

  const range = await getAuditLogFiltered({
    from: '2026-01-02T00:00:00.000Z',
    to: '2026-01-04T00:00:00.000Z',
  });
  assert.equal(range.total, 2);
  assert.deepEqual(range.entries.map((e) => e.id), ['a3', 'a2']);
});

test('getAuditLogFiltered: pagination slices entries but total ignores limit/offset', async () => {
  seedAuditRows();
  const page = await getAuditLogFiltered({ limit: 2, offset: 1 });
  assert.equal(page.total, 5);
  assert.deepEqual(page.entries.map((e) => e.id), ['a4', 'a3']);

  const beyond = await getAuditLogFiltered({ limit: 2, offset: 10 });
  assert.equal(beyond.total, 5);
  assert.deepEqual(beyond.entries, []);

  const clamped = await getAuditLogFiltered({ limit: 500 });
  assert.equal(clamped.total, 5);
  assert.equal(clamped.entries.length, 5);
});

test('getAuditLogFiltered: unparseable dates are ignored', async () => {
  seedAuditRows();
  const { entries, total } = await getAuditLogFiltered({ from: 'not-a-date', to: 'also-not-a-date' });
  assert.equal(total, 5);
  assert.equal(entries.length, 5);
});

test('getAuditLog (unfiltered) is unchanged by the filtered variant', async () => {
  seedAuditRows();
  const entries = await getAuditLog();
  assert.equal(entries.length, 5);
  assert.equal(entries[0].id, 'a5');
});

// ---------------------------------------------------------------------------
// getUsersByIds + SessionUser wiring
// ---------------------------------------------------------------------------

test('getUsersByIds resolves names/emails in one call, skipping unknown ids', async () => {
  const map = await getUsersByIds(['admin-1', 'student-1', 'nobody']);
  assert.equal(map.size, 2);
  assert.deepEqual(map.get('admin-1'), { name: 'User admin-1', email: 'admin-1@example.com' });
  assert.deepEqual(map.get('student-1'), { name: 'User student-1', email: 'student-1@example.com' });
  assert.equal(map.has('nobody'), false);

  const empty = await getUsersByIds([]);
  assert.equal(empty.size, 0);
});

test('toSessionUser carries canViewAuditLog (granted admin true, everyone else false)', async () => {
  const granted = await getUserById('admin-2');
  assert.ok(granted);
  assert.equal(toSessionUser(granted).canViewAuditLog, true);

  const plain = await getUserById('admin-1');
  assert.ok(plain);
  assert.equal(toSessionUser(plain).canViewAuditLog, false);

  const student = await getUserById('student-1');
  assert.ok(student);
  assert.equal(toSessionUser(student).canViewAuditLog, false);
});

test('canViewAuditLog defaults to false for users seeded without it', async () => {
  const admin = await getUserById('admin-1');
  assert.equal(admin?.canViewAuditLog, false);
  const student = await getUserById('student-1');
  assert.equal(student?.canViewAuditLog, false);
});
