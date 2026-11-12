/**
 * Phase 2 foundation tests — flags role model + contract models.
 *
 * Covers the behaviours the feature workers build on:
 * - A user with isTeacher + isAdmin passes both admin and instructor guards.
 * - Revoking admin from a teacher restores the teacher role (not student).
 * - Granting admin to a teacher preserves the teacher flag (and primary role).
 * - A user with only isTeacher cannot reach /admin.
 * - adminPermissions NULL = full admin still holds (with the flag).
 * - Invitation tokens are SHA-256-hashed, single-use and expiring.
 * - Application stages / history / notes round-trip; history survives a stage delete.
 * - Applications link to the applicant's account by email (userId).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  can,
  effectiveRoles,
  hasAdminCapability,
  hasTeacherCapability,
  ownsCourse,
  ownsEnrollment,
} from '../lib/rbac';
import { toSessionUser } from '../lib/services/auth-service';
import {
  __resetTestSession,
  __setTestSession,
  requireAdmin,
  requireAdminArea,
  requireFullAdmin,
  requireRoles,
} from '../lib/api-helpers';
import {
  primaryRoleAfterRevoke,
  revokeAdminAccess,
  updateAdminAccess,
} from '../lib/services/admin-access-service';
import {
  reviewApplicationService,
  submitApplication,
} from '../lib/services/application-service';
import { getUserById } from '../lib/db/users';
import { getInstructors } from '../lib/db/users';
import { createApplication } from '../lib/db/applications';
import {
  addHistory,
  addNote,
  createStage,
  deleteStage,
  listHistory,
  listNotes,
  listStages,
  reorderStages,
} from '../lib/db/application-stages';
import {
  createInvitation,
  getInvitationByTokenHash,
  listPendingInvitationsForEmail,
  markInvitationUsed,
} from '../lib/db/invitations';
import { hashToken } from '../lib/security';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';

let fake: FakeDb;

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

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedUser('admin-full', 'admin');
  // Phase 5: the admin-access service is official-only now — service
  // calls below act as the official administrator.
  seedUser('official-1', 'admin', { email: 'mhateemjutt1412@gmail.com', isAdmin: true });
  seedUser('teacher-1', 'instructor', { isTeacher: true });
  seedUser('teacher-admin', 'instructor', { isTeacher: true, isAdmin: true });
  seedUser('student-1', 'student');
  seedUser('flag-teacher', 'student', { isTeacher: true });
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ---------------------------------------------------------------------------
// Capability helpers (lib/rbac.ts)
// ---------------------------------------------------------------------------

test('flags: a teacher+admin has both capabilities; a teacher-only has only the teacher one', () => {
  const both = { role: 'instructor' as const, isTeacher: true, isAdmin: true };
  assert.equal(hasAdminCapability(both), true);
  assert.equal(hasTeacherCapability(both), true);
  assert.deepEqual(effectiveRoles(both).sort(), ['admin', 'instructor']);

  const teacherOnly = { role: 'student' as const, isTeacher: true };
  assert.equal(hasAdminCapability(teacherOnly), false);
  assert.equal(hasTeacherCapability(teacherOnly), true);
  // Primary role 'student' + teacher flag: acts as both student and teacher.
  assert.deepEqual(effectiveRoles(teacherOnly).sort(), ['instructor', 'student']);

  const plain = { role: 'student' as const, isTeacher: false, isAdmin: false };
  assert.equal(hasAdminCapability(plain), false);
  assert.equal(hasTeacherCapability(plain), false);
  assert.deepEqual(effectiveRoles(plain), ['student']);
});

test('flags: legacy primary roles still count (pre-backfill / seed rows)', () => {
  assert.equal(hasAdminCapability({ role: 'admin' }), true);
  assert.equal(hasTeacherCapability({ role: 'instructor' }), true);
  assert.equal(hasAdminCapability(null), false);
  assert.equal(hasTeacherCapability(undefined), false);
});

test('can(): a teacher+admin passes admin AND instructor capabilities; a pure admin does not gain instructor-only ones', () => {
  const both = { role: 'instructor' as const, isTeacher: true, isAdmin: true };
  assert.equal(can(both, 'manageUsers'), true);
  assert.equal(can(both, 'createCourse'), true);
  assert.equal(can(both, 'proposeCertificate'), true);
  assert.equal(can(both, 'publishCourse'), true);

  const pureAdmin = { role: 'admin' as const, isAdmin: true };
  assert.equal(can(pureAdmin, 'manageUsers'), true);
  assert.equal(can(pureAdmin, 'editOwnCourse'), false);
  assert.equal(can(pureAdmin, 'proposeCertificate'), false);

  // Bare-role form is unchanged.
  assert.equal(can('student', 'manageUsers'), false);
  assert.equal(can('admin', 'manageUsers'), true);
  assert.equal(can('instructor', 'createCourse'), true);
});

test('ownsCourse / ownsEnrollment honour the flags', () => {
  const teacher = { id: 't1', role: 'student' as const, isTeacher: true };
  assert.equal(ownsCourse(teacher, 't1'), true);
  assert.equal(ownsCourse(teacher, 't2'), false);
  assert.equal(ownsCourse({ id: 'a1', role: 'admin' as const, isAdmin: true }, 't1'), false);
  assert.equal(ownsEnrollment({ id: 'a1', role: 'student' as const, isAdmin: true }, 'anyone'), true);
  assert.equal(ownsEnrollment({ id: 's1', role: 'student' as const }, 's1'), true);
  assert.equal(ownsEnrollment({ id: 's1', role: 'student' as const }, 's2'), false);
});

test('toSessionUser carries both flags into the session', () => {
  const session = toSessionUser({
    id: 'u1',
    name: 'T',
    email: 't@example.com',
    role: 'instructor',
    isAdmin: true,
    isTeacher: true,
    canViewAuditLog: false,
    status: 'active',
    joinedAt: '2024-01-01',
  });
  assert.equal(session.isAdmin, true);
  assert.equal(session.isTeacher, true);
  assert.equal(session.role, 'instructor');
});

// ---------------------------------------------------------------------------
// Route guards (lib/api-helpers.ts)
// ---------------------------------------------------------------------------

test('guards: teacher+admin passes admin and instructor gates; teacher-only is denied /admin', async () => {
  __setTestSession({ id: 'teacher-admin', name: 'TA', email: 'ta@example.com', role: 'instructor', isTeacher: true, isAdmin: true });
  assert.ok(!('error' in await requireAdmin()));
  assert.ok(!('error' in await requireAdminArea('applications')));
  assert.ok(!('error' in await requireRoles(['admin', 'instructor'])));
  assert.ok(!('error' in await requireRoles(['instructor'])));

  __setTestSession({ id: 'flag-teacher', name: 'FT', email: 'ft@example.com', role: 'student', isTeacher: true });
  const denied = await requireAdmin();
  assert.ok('error' in denied);
  assert.equal(denied.error.status, 403);
  const deniedArea = await requireAdminArea('courses');
  assert.ok('error' in deniedArea);
  assert.equal(deniedArea.error.status, 403);
  // ...but the same user passes the instructor gate via the flag.
  assert.ok(!('error' in await requireRoles(['instructor'])));

  __setTestSession({ id: 'student-1', name: 'S', email: 's@example.com', role: 'student' });
  assert.ok('error' in await requireRoles(['instructor']));
});

test('guards: adminPermissions NULL = full admin still holds (flag admin, no restriction)', async () => {
  __setTestSession({ id: 'flag-admin', name: 'FA', email: 'fa@example.com', role: 'student', isAdmin: true });
  assert.ok(!('error' in await requireFullAdmin()));
  assert.ok(!('error' in await requireAdminArea('settings')));

  __setTestSession({ id: 'restricted', name: 'R', email: 'r@example.com', role: 'student', isAdmin: true, adminPermissions: { courses: true } });
  const denied = await requireFullAdmin();
  assert.ok('error' in denied);
  assert.equal(denied.error.status, 403);
  assert.ok(!('error' in await requireAdminArea('courses')));
  assert.ok('error' in await requireAdminArea('settings'));
});

// ---------------------------------------------------------------------------
// Admin access service — the revoke bug fix + flag-preserving grant
// ---------------------------------------------------------------------------

test('grant: granting admin to a teacher preserves the teacher flag and primary role', async () => {
  const result = await updateAdminAccess('official-1', 'teacher-1', {
    permissions: { courses: true },
  });
  assert.ok(!('error' in result));
  assert.equal(result.user.isAdmin, true);
  assert.equal(result.user.isTeacher, true);
  assert.equal(result.user.role, 'instructor');
  assert.deepEqual(result.user.adminPermissions, { courses: true });
});

test('revoke: revoking admin from a teacher restores the INSTRUCTOR role (not student)', async () => {
  await updateAdminAccess('official-1', 'teacher-1', { permissions: { courses: true } });
  const result = await revokeAdminAccess('official-1', 'teacher-1');
  assert.ok(!('error' in result));
  assert.equal(result.user.isAdmin, false);
  assert.equal(result.user.isTeacher, true);
  assert.equal(result.user.role, 'instructor');
  assert.equal(result.user.adminPermissions, undefined);

  const stored = await getUserById('teacher-1');
  assert.equal(stored?.role, 'instructor');
  assert.equal(stored?.isTeacher, true);
});

test('revoke: revoking admin from a plain admin restores the student role', async () => {
  const result = await revokeAdminAccess('official-1', 'teacher-admin');
  // teacher-admin is a teacher+admin, so it restores to instructor…
  assert.ok(!('error' in result));
  assert.equal(result.user.role, 'instructor');

  seedUser('plain-admin', 'admin', { isAdmin: true });
  const plain = await revokeAdminAccess('official-1', 'plain-admin');
  assert.ok(!('error' in plain));
  assert.equal(plain.user.role, 'student');
  assert.equal(plain.user.isAdmin, false);
});

test('primaryRoleAfterRevoke derives the fallback role from the flags', () => {
  assert.equal(primaryRoleAfterRevoke({ isTeacher: true }), 'instructor');
  assert.equal(primaryRoleAfterRevoke({ isTeacher: false }), 'student');
  assert.equal(primaryRoleAfterRevoke({}), 'student');
});

test('getInstructors includes a flag teacher whose primary role is student', async () => {
  const instructors = await getInstructors();
  const ids = instructors.map((u) => u.id);
  assert.ok(ids.includes('teacher-1'));
  assert.ok(ids.includes('teacher-admin'));
  assert.ok(ids.includes('flag-teacher'));
  assert.ok(!ids.includes('student-1'));
  assert.ok(!ids.includes('admin-full'));
});

// ---------------------------------------------------------------------------
// Applications: new fields + account linking + flag-aware review
// ---------------------------------------------------------------------------

test('applications: new fields round-trip and submit links userId by email', async () => {
  const created = await createApplication({
    name: 'Nadia',
    email: 'teacher-1@example.com',
    message: 'I want to teach',
    additionalInfo: 'Evenings work best',
    whyGoodFit: 'I built the course this site teaches',
    userId: 'teacher-1',
  });
  assert.equal(created.additionalInfo, 'Evenings work best');
  assert.equal(created.whyGoodFit, 'I built the course this site teaches');
  assert.equal(created.userId, 'teacher-1');
  assert.equal(created.message, 'I want to teach');

  const submitted = await submitApplication({
    name: 'Student One',
    email: 'student-1@example.com',
    message: 'I want to teach too',
    whyGoodFit: 'I love teaching',
    // Module 3: LinkedIn/CV/demo are required by submitApplication now.
    linkedinUrl: 'https://linkedin.com/in/student-one',
    cvUrl: 'cvs/11111111-1111-1111-1111-111111111111.pdf',
    demoRecordingUrl: 'demos/22222222-2222-2222-2222-222222222222.mp4',
  });
  assert.ok(!('error' in submitted));
  assert.equal(submitted.application.userId, 'student-1');

  const stranger = await submitApplication({
    name: 'Nobody',
    email: 'nobody@example.com',
    message: 'Hello',
    whyGoodFit: 'Fit',
    // Module 3: LinkedIn/CV/demo are required by submitApplication now.
    linkedinUrl: 'https://linkedin.com/in/nobody',
    cvUrl: 'cvs/33333333-3333-3333-3333-333333333333.pdf',
    demoRecordingUrl: 'demos/44444444-4444-4444-4444-444444444444.mp4',
  });
  assert.ok(!('error' in stranger));
  assert.equal(stranger.application.userId, undefined);
});

test('applications: a flag admin can review; a teacher-only cannot', async () => {
  const app = await createApplication({ name: 'A', email: 'a@example.com' });
  const byFlagAdmin = await reviewApplicationService(
    { id: 'flag-admin', role: 'student', isAdmin: true },
    app.id,
    'approved',
  );
  assert.ok(!('error' in byFlagAdmin));
  assert.equal(byFlagAdmin.application.status, 'approved');

  const app2 = await createApplication({ name: 'B', email: 'b@example.com' });
  const byTeacher = await reviewApplicationService(
    { id: 'teacher-1', role: 'instructor', isTeacher: true },
    app2.id,
    'approved',
  );
  assert.ok('error' in byTeacher);
  assert.equal(byTeacher.status, 403);
});

// ---------------------------------------------------------------------------
// Application stages / history / notes
// ---------------------------------------------------------------------------

test('stages: create, list in position order, reorder, history and notes', async () => {
  const s2 = await createStage({ name: 'Screening', position: 2 });
  const s1 = await createStage({ name: 'Received', position: 1, instructions: 'Check the CV' });
  assert.deepEqual((await listStages()).map((s) => s.name), ['Received', 'Screening']);
  assert.equal(s1.instructions, 'Check the CV');

  const app = await createApplication({ name: 'C', email: 'c@example.com' });
  const entry = await addHistory({
    applicationId: app.id,
    stageId: s1.id,
    stageName: s1.name,
    actorId: 'admin-full',
    action: 'stage_assigned',
    note: 'Moved to screening',
  });
  assert.equal(entry.stageName, 'Received');
  assert.equal(entry.action, 'stage_assigned');
  const history = await listHistory(app.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].note, 'Moved to screening');

  const note = await addNote({ applicationId: app.id, authorId: 'admin-full', body: 'Strong CV' });
  assert.equal(note.isInternal, true);
  assert.equal(note.body, 'Strong CV');
  assert.equal((await listNotes(app.id)).length, 1);

  const reordered = await reorderStages([
    { id: s2.id, position: 1 },
    { id: s1.id, position: 2 },
  ]);
  assert.deepEqual(reordered.map((s) => s.name), ['Screening', 'Received']);
});

test('stages: deleting a stage keeps its history (stageName snapshot survives)', async () => {
  const stage = await createStage({ name: 'Demo', position: 1 });
  const app = await createApplication({ name: 'D', email: 'd@example.com' });
  await addHistory({
    applicationId: app.id,
    stageId: stage.id,
    stageName: stage.name,
    actorId: 'admin-full',
    action: 'stage_assigned',
  });
  assert.equal(await deleteStage(stage.id), true);
  assert.deepEqual(await listStages(), []);
  const history = await listHistory(app.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].stageName, 'Demo');
});

// ---------------------------------------------------------------------------
// Invitations: hash-only storage, single-use, expiry
// ---------------------------------------------------------------------------

test('invitations: only the SHA-256 hash is stored; token is single-use and expires', async () => {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  assert.equal(tokenHash, createHash('sha256').update(rawToken).digest('hex'));
  assert.notEqual(tokenHash, rawToken);

  const inv = await createInvitation({
    email: 'invite@example.com',
    firstName: 'Inv',
    lastName: 'Itee',
    grants: { isTeacher: true, isAdmin: false, adminPermissions: null },
    tokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    invitedById: 'admin-full',
  });
  // The stored row never contains the raw token.
  assert.equal(inv.tokenHash, tokenHash);
  assert.equal(JSON.stringify(inv).includes(rawToken), false);
  assert.deepEqual(inv.grants, { isTeacher: true, isAdmin: false, adminPermissions: null });

  const found = await getInvitationByTokenHash(tokenHash);
  assert.ok(found);
  assert.equal(found.email, 'invite@example.com');

  // Single-use: first mark succeeds, second fails.
  assert.equal(await markInvitationUsed(inv.id), true);
  assert.equal(await markInvitationUsed(inv.id), false);

  // Expiry: an expired invitation is not pending.
  const expired = await createInvitation({
    email: 'invite@example.com',
    firstName: 'Old',
    lastName: 'Invite',
    grants: {},
    tokenHash: hashToken(randomBytes(32).toString('hex')),
    expiresAt: new Date(Date.now() - 1000),
    invitedById: 'admin-full',
  });
  void expired;
  const pending = await listPendingInvitationsForEmail('invite@example.com');
  assert.equal(pending.length, 0);
  assert.equal(await getInvitationByTokenHash(hashToken('nope')), null);
});
