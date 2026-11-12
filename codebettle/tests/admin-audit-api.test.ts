import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { getAuditLog } from '../lib/db/audit';
import { createFakeDb, type FakeDb } from './fake-db';
import { GET as auditGet } from '../app/api/admin/audit/route';
import {
  GET as accessGet,
  POST as accessGrant,
} from '../app/api/admin/audit/access/route';
import { DELETE as accessRevoke } from '../app/api/admin/audit/access/[userId]/route';
import { GET as accessUsersGet } from '../app/api/admin/access/users/route';
import { GET as invitationsGet } from '../app/api/admin/access/invitations/route';
import type { SessionUser } from '../lib/services/auth-service';

/**
 * Phase 5, Module 23 (Worker B) — audit API + audit-access API + the
 * re-gated access-management surface.
 *
 * Guards under test: requireSuperAdmin (official administrators only),
 * requireAuditLogAccess (officials, or admins with the canViewAuditLog
 * grant), and the denied-attempt logging ('admin.audit.view-denied')
 * that must precede every 403 on the audit surface.
 */

const D = (s: string) => new Date(s);

const OFFICIAL1: SessionUser = {
  id: 'official-1',
  name: 'Muhammad Hateem Hussain',
  email: 'mhateemjutt1412@gmail.com',
  role: 'admin',
  isAdmin: true,
};
const FULL: SessionUser = { id: 'admin-full', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const RESTRICTED: SessionUser = {
  id: 'admin-restricted',
  name: 'Restricted',
  email: 'r@example.com',
  role: 'admin',
  adminPermissions: { courses: true },
};
const GRANTED: SessionUser = {
  id: 'admin-granted',
  name: 'Granted',
  email: 'g@example.com',
  role: 'admin',
  canViewAuditLog: true,
};
const STUDENT: SessionUser = { id: 'student-1', name: 'Student', email: 's@example.com', role: 'student' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function seedUsers() {
  fake.seed('User', [
    { id: 'official-1', name: 'Muhammad Hateem Hussain', email: 'mhateemjutt1412@gmail.com', passwordHash: '$2b$12$hash', role: 'admin', isAdmin: true, status: 'active', joinedAt: D('2024-01-01') },
    { id: 'official-2', name: 'Ahmad Hassan', email: 'ahmad.hassan.hnd@gmail.com', passwordHash: '$2b$12$hash', role: 'admin', isAdmin: true, status: 'active', joinedAt: D('2024-01-01') },
    { id: 'admin-full', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'admin-restricted', name: 'Restricted', email: 'r@example.com', passwordHash: '$2b$12$hash', role: 'admin', adminPermissions: { courses: true }, status: 'active', joinedAt: D('2024-01-01') },
    { id: 'admin-granted', name: 'Granted', email: 'g@example.com', passwordHash: '$2b$12$hash', role: 'admin', canViewAuditLog: true, status: 'active', joinedAt: D('2024-01-01') },
    { id: 'student-1', name: 'Student', email: 's@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
}

function seedLogs() {
  fake.seed('AuditLog', [
    { id: 'log-1', actorId: 'official-1', action: 'admin.access.grant', entity: 'user', entityId: 'student-1', detail: 'grant', ip: null, createdAt: D('2026-11-01T10:00:00Z') },
    { id: 'log-2', actorId: 'official-2', action: 'admin.access.revoke', entity: 'user', entityId: 'student-1', detail: 'revoke', ip: null, createdAt: D('2026-11-03T10:00:00Z') },
    { id: 'log-3', actorId: 'admin-full', action: 'admin.access.grant', entity: 'user', entityId: 'student-1', detail: 'grant', ip: null, createdAt: D('2026-11-05T10:00:00Z') },
    { id: 'log-4', actorId: 'official-1', action: 'admin.audit-access.grant', entity: 'user', entityId: 'admin-granted', detail: 'grant', ip: null, createdAt: D('2026-11-07T10:00:00Z') },
    { id: 'log-5', actorId: null, action: 'auth.login', entity: 'session', entityId: null, detail: null, ip: '1.2.3.4', createdAt: D('2026-11-09T10:00:00Z') },
  ]);
}

async function denialEntries(actorId?: string) {
  const entries = await getAuditLog();
  return entries.filter(
    (e) => e.action === 'admin.audit.view-denied' && (actorId === undefined || e.actorId === actorId),
  );
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedUsers();
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ---------------------------------------------------------------------------
// GET /api/admin/audit — gates + denial logging
// ---------------------------------------------------------------------------

test('audit API: signed-out user gets 401 and no denial entry is written', async () => {
  __setTestSession(null);
  const res = await auditGet(new NextRequest('http://localhost/api/admin/audit'));
  assert.equal(res.status, 401);
  assert.equal((await denialEntries()).length, 0);
});

test('audit API: student gets 403 and a denial entry is written', async () => {
  __setTestSession(STUDENT);
  const res = await auditGet(new NextRequest('http://localhost/api/admin/audit'));
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, 'Audit log access is not granted');
  const denied = await denialEntries('student-1');
  assert.equal(denied.length, 1);
  assert.equal(denied[0].entity, 'audit_log');
  assert.match(denied[0].detail ?? '', /s@example\.com/);
  assert.match(denied[0].detail ?? '', /view the audit log/);
});

test('audit API: restricted and non-official full admins are denied, each with a denial entry', async () => {
  __setTestSession(RESTRICTED);
  assert.equal((await auditGet(new NextRequest('http://localhost/api/admin/audit'))).status, 403);
  __setTestSession(FULL);
  assert.equal((await auditGet(new NextRequest('http://localhost/api/admin/audit'))).status, 403);
  const denied = await denialEntries();
  assert.equal(denied.length, 2);
  assert.deepEqual(
    denied.map((e) => e.actorId).sort(),
    ['admin-full', 'admin-restricted'],
  );
});

// ---------------------------------------------------------------------------
// GET /api/admin/audit — listing, filters, pagination, actor names
// ---------------------------------------------------------------------------

test('audit API: granted admin lists entries with actor names and emails resolved', async () => {
  seedLogs();
  __setTestSession(GRANTED);
  const res = await auditGet(new NextRequest('http://localhost/api/admin/audit'));
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    entries: { id: string; actorId: string | null; actorName: string | null; actorEmail: string | null }[];
    total: number;
    page: number;
    pageSize: number;
  };
  assert.equal(body.total, 5);
  assert.equal(body.entries.length, 5);
  assert.equal(body.page, 1);
  assert.equal(body.pageSize, 50);
  // Newest first.
  assert.deepEqual(
    body.entries.map((e) => e.id),
    ['log-5', 'log-4', 'log-3', 'log-2', 'log-1'],
  );
  const log1 = body.entries.find((e) => e.id === 'log-1');
  assert.equal(log1?.actorName, 'Muhammad Hateem Hussain');
  assert.equal(log1?.actorEmail, 'mhateemjutt1412@gmail.com');
  const log3 = body.entries.find((e) => e.id === 'log-3');
  assert.equal(log3?.actorName, 'Admin');
  assert.equal(log3?.actorEmail, 'admin@codebettle.com');
  // System entry (null actor) resolves to nulls, not a crash.
  const log5 = body.entries.find((e) => e.id === 'log-5');
  assert.equal(log5?.actorId, null);
  assert.equal(log5?.actorName, null);
  assert.equal(log5?.actorEmail, null);
});

test('audit API: official filters by actor, action, entity and date range', async () => {
  seedLogs();
  __setTestSession(OFFICIAL1);

  const byAction = (await (
    await auditGet(new NextRequest('http://localhost/api/admin/audit?action=admin.access.grant'))
  ).json()) as { entries: { id: string }[]; total: number };
  assert.equal(byAction.total, 2);
  assert.deepEqual(
    byAction.entries.map((e) => e.id).sort(),
    ['log-1', 'log-3'],
  );

  const byActor = (await (
    await auditGet(new NextRequest('http://localhost/api/admin/audit?actor=official-1'))
  ).json()) as { total: number };
  assert.equal(byActor.total, 2);

  const byEntity = (await (
    await auditGet(new NextRequest('http://localhost/api/admin/audit?entity=session'))
  ).json()) as { entries: { id: string }[]; total: number };
  assert.equal(byEntity.total, 1);
  assert.equal(byEntity.entries[0].id, 'log-5');

  const byDate = (await (
    await auditGet(new NextRequest('http://localhost/api/admin/audit?from=2026-11-03&to=2026-11-06'))
  ).json()) as { entries: { id: string }[]; total: number };
  assert.equal(byDate.total, 2);
  assert.deepEqual(
    byDate.entries.map((e) => e.id).sort(),
    ['log-2', 'log-3'],
  );

  const combined = (await (
    await auditGet(
      new NextRequest('http://localhost/api/admin/audit?action=admin.access.grant&actor=official-1'),
    )
  ).json()) as { total: number };
  assert.equal(combined.total, 1);
});

test('audit API: pagination honours page and pageSize', async () => {
  seedLogs();
  __setTestSession(OFFICIAL1);

  const p1 = (await (
    await auditGet(new NextRequest('http://localhost/api/admin/audit?pageSize=2&page=1'))
  ).json()) as { entries: { id: string }[]; total: number; page: number; pageSize: number };
  assert.equal(p1.total, 5);
  assert.deepEqual(
    p1.entries.map((e) => e.id),
    ['log-5', 'log-4'],
  );
  assert.equal(p1.page, 1);
  assert.equal(p1.pageSize, 2);

  const p2 = (await (
    await auditGet(new NextRequest('http://localhost/api/admin/audit?pageSize=2&page=2'))
  ).json()) as { entries: { id: string }[] };
  assert.deepEqual(
    p2.entries.map((e) => e.id),
    ['log-3', 'log-2'],
  );

  const p3 = (await (
    await auditGet(new NextRequest('http://localhost/api/admin/audit?pageSize=2&page=3'))
  ).json()) as { entries: { id: string }[]; total: number };
  assert.deepEqual(
    p3.entries.map((e) => e.id),
    ['log-1'],
  );
  assert.equal(p3.total, 5);

  const p4 = (await (
    await auditGet(new NextRequest('http://localhost/api/admin/audit?pageSize=2&page=4'))
  ).json()) as { entries: unknown[]; total: number };
  assert.deepEqual(p4.entries, []);
  assert.equal(p4.total, 5);
});

test('audit API: invalid query params are 400', async () => {
  __setTestSession(OFFICIAL1);
  for (const query of [
    'page=0',
    'page=-1',
    'page=abc',
    'page=1.5',
    'pageSize=0',
    'pageSize=101',
    'pageSize=abc',
    'from=not-a-date',
    'to=not-a-date',
  ]) {
    const res = await auditGet(new NextRequest(`http://localhost/api/admin/audit?${query}`));
    assert.equal(res.status, 400, query);
  }
});

// ---------------------------------------------------------------------------
// /api/admin/audit/access — list / grant / revoke
// ---------------------------------------------------------------------------

test('audit-access GET: official lists officials and granted; others get 403 with a denial entry', async () => {
  __setTestSession(OFFICIAL1);
  const res = await accessGet(new NextRequest('http://localhost/api/admin/audit/access'));
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    officials: { id: string; name: string; email: string }[];
    granted: { id: string; name: string; email: string }[];
  };
  assert.deepEqual(
    body.officials.map((u) => u.email).sort(),
    ['ahmad.hassan.hnd@gmail.com', 'mhateemjutt1412@gmail.com'],
  );
  assert.deepEqual(body.granted, [{ id: 'admin-granted', name: 'Granted', email: 'g@example.com' }]);

  __setTestSession(FULL);
  assert.equal((await accessGet(new NextRequest('http://localhost/api/admin/audit/access'))).status, 403);
  __setTestSession(GRANTED);
  assert.equal((await accessGet(new NextRequest('http://localhost/api/admin/audit/access'))).status, 403);
  __setTestSession(null);
  assert.equal((await accessGet(new NextRequest('http://localhost/api/admin/audit/access'))).status, 401);

  const denied = await denialEntries();
  assert.equal(denied.length, 2);
  assert.ok(denied.every((e) => (e.detail ?? '').includes('GET /api/admin/audit/access')));
});

test('audit-access POST: official grants (idempotent); validation and target rules; non-official gets 403', async () => {
  __setTestSession(FULL);
  const forbidden = await accessGrant(
    jsonReq('http://localhost/api/admin/audit/access', 'POST', { userId: 'admin-restricted' }),
  );
  assert.equal(forbidden.status, 403);
  const denied = await denialEntries('admin-full');
  assert.equal(denied.length, 1);
  assert.ok((denied[0].detail ?? '').includes('POST /api/admin/audit/access'));

  __setTestSession(OFFICIAL1);
  const granted = await accessGrant(
    jsonReq('http://localhost/api/admin/audit/access', 'POST', { userId: 'admin-full' }),
  );
  assert.equal(granted.status, 200);
  const grantedBody = (await granted.json()) as { user: { id: string; canViewAuditLog: boolean } };
  assert.equal(grantedBody.user.id, 'admin-full');
  assert.equal(grantedBody.user.canViewAuditLog, true);

  // Idempotent second grant.
  const again = await accessGrant(
    jsonReq('http://localhost/api/admin/audit/access', 'POST', { userId: 'admin-full' }),
  );
  assert.equal(again.status, 200);

  // Granting an official is a no-op success.
  const official = await accessGrant(
    jsonReq('http://localhost/api/admin/audit/access', 'POST', { userId: 'official-2' }),
  );
  assert.equal(official.status, 200);

  // Target rules.
  assert.equal(
    (await accessGrant(jsonReq('http://localhost/api/admin/audit/access', 'POST', { userId: 'student-1' }))).status,
    400,
  );
  assert.equal(
    (await accessGrant(jsonReq('http://localhost/api/admin/audit/access', 'POST', { userId: 'nobody' }))).status,
    404,
  );

  // Body validation.
  assert.equal((await accessGrant(jsonReq('http://localhost/api/admin/audit/access', 'POST', {}))).status, 400);
  assert.equal(
    (await accessGrant(jsonReq('http://localhost/api/admin/audit/access', 'POST', { userId: '' }))).status,
    400,
  );
  assert.equal(
    (await accessGrant(new NextRequest('http://localhost/api/admin/audit/access', { method: 'POST' }))).status,
    400,
  );

  // The grant shows up in the list.
  const listed = (await (
    await accessGet(new NextRequest('http://localhost/api/admin/audit/access'))
  ).json()) as { granted: { id: string }[] };
  assert.deepEqual(
    listed.granted.map((u) => u.id).sort(),
    ['admin-full', 'admin-granted'],
  );
});

test('audit-access DELETE: official revokes; officials cannot be revoked; non-official gets 403', async () => {
  __setTestSession(FULL);
  const forbidden = await accessRevoke(
    new NextRequest('http://localhost/api/admin/audit/access/admin-granted', { method: 'DELETE' }),
    { params: Promise.resolve({ userId: 'admin-granted' }) },
  );
  assert.equal(forbidden.status, 403);
  const denied = await denialEntries('admin-full');
  assert.equal(denied.length, 1);
  assert.ok((denied[0].detail ?? '').includes('DELETE /api/admin/audit/access/[userId]'));

  __setTestSession(OFFICIAL1);
  const revoked = await accessRevoke(
    new NextRequest('http://localhost/api/admin/audit/access/admin-granted', { method: 'DELETE' }),
    { params: Promise.resolve({ userId: 'admin-granted' }) },
  );
  assert.equal(revoked.status, 200);
  const revokedBody = (await revoked.json()) as { user: { id: string; canViewAuditLog: boolean } };
  assert.equal(revokedBody.user.id, 'admin-granted');
  assert.equal(revokedBody.user.canViewAuditLog, false);

  // Revoking again is a no-op success.
  const again = await accessRevoke(
    new NextRequest('http://localhost/api/admin/audit/access/admin-granted', { method: 'DELETE' }),
    { params: Promise.resolve({ userId: 'admin-granted' }) },
  );
  assert.equal(again.status, 200);

  // Officials cannot be revoked; unknown users 404.
  assert.equal(
    (
      await accessRevoke(new NextRequest('http://localhost/api/admin/audit/access/official-2', { method: 'DELETE' }), {
        params: Promise.resolve({ userId: 'official-2' }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await accessRevoke(new NextRequest('http://localhost/api/admin/audit/access/nobody', { method: 'DELETE' }), {
        params: Promise.resolve({ userId: 'nobody' }),
      })
    ).status,
    404,
  );

  const listed = (await (
    await accessGet(new NextRequest('http://localhost/api/admin/audit/access'))
  ).json()) as { granted: unknown[] };
  assert.deepEqual(listed.granted, []);
});

test('audit grant is not official status: a granted admin can view the log but cannot manage access', async () => {
  __setTestSession(GRANTED);
  assert.equal((await auditGet(new NextRequest('http://localhost/api/admin/audit'))).status, 200);
  assert.equal((await accessGet(new NextRequest('http://localhost/api/admin/audit/access'))).status, 403);
});

// ---------------------------------------------------------------------------
// Re-gated access-management surface (Phase 5): officials only
// ---------------------------------------------------------------------------

test('access-management routes are official-only: full and restricted admins get 403, officials pass', async () => {
  __setTestSession(FULL);
  assert.equal((await accessUsersGet(new NextRequest('http://localhost/api/admin/access/users'))).status, 403);
  assert.equal((await invitationsGet()).status, 403);

  __setTestSession(RESTRICTED);
  assert.equal((await accessUsersGet(new NextRequest('http://localhost/api/admin/access/users'))).status, 403);

  __setTestSession(OFFICIAL1);
  const users = await accessUsersGet(new NextRequest('http://localhost/api/admin/access/users'));
  assert.equal(users.status, 200);
  const usersBody = (await users.json()) as { users: { id: string }[] };
  assert.equal(usersBody.users.length, 6);
  const invites = await invitationsGet();
  assert.equal(invites.status, 200);

  __setTestSession(null);
  assert.equal((await accessUsersGet(new NextRequest('http://localhost/api/admin/access/users'))).status, 401);
});
