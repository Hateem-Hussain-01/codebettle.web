/**
 * Recruitment portal tests — Phase 2, Modules 19/20/21.
 *
 * Covers what the coordinator asked for:
 * - Applicant portal guard: a non-applicant cannot open tracking for
 *   someone else's application (404); the owner can.
 * - Tracking API hides unassigned future stages: the view carries
 *   only current + completed + the single next stage — no full
 *   pipeline, no notes, no other application.
 * - Stage transition writes history + audit.
 * - Onboarding sets the teacher flag WITHOUT creating a new account
 *   or changing the password (same id, same hash, same user count).
 * - Admin-assisted access is view-only + audit-logged + cannot open
 *   a student portal (token verify rejects forged/expired tokens,
 *   startViewAs refuses students, assertNotViewAs blocks mutations).
 * - Custom stage CRUD works (create / rename / reorder / delete, and
 *   history survives a stage delete).
 * - Duplicate rule: one pending application at a time; a decided
 *   application does not block a fresh one.
 * - Request-info + review write history and notify the applicant.
 * - Stage-column decision: the current stage is the latest history
 *   entry (no stage column on InstructorApplication).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession, assertNotViewAs } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { getAuditLog } from '../lib/db/audit';
import { createApplication } from '../lib/db/applications';
import {
  createStage,
  deleteStage,
  ensureDefaultStages,
  getCurrentStage,
  listStages,
  reorderStages,
  updateStage,
} from '../lib/db/application-stages';
import { getUserByIdWithHash } from '../lib/db/users';
import { reviewApplicationService } from '../lib/services/application-service';
import {
  assignStage,
  buildApplicantTrackingView,
  canCreateNewApplication,
  createApplicantApplication,
  getApplicantTracking,
  listMyApplications,
  onboardApplication,
  requestInfo,
  startViewAs,
} from '../lib/services/recruitment-service';
import { mintViewAsToken, verifyViewAsToken } from '../lib/view-as';
import { listNotificationsForUser } from '../lib/db/notifications';
import type { SessionUser } from '../lib/services/auth-service';

const HASH = '$2b$12$dummyhashdummyhashdummyhashdummyhashdummyhashdummyha';

const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin', isAdmin: true };
const ADMIN_ACTOR = { id: 'admin-1', role: 'admin' as const, isAdmin: true };
const TEACHER: SessionUser = { id: 'teacher-1', name: 'Tea Cher', email: 'teacher@example.com', role: 'instructor', isTeacher: true };
const APPLICANT: SessionUser = { id: 'applicant-1', name: 'App Licant', email: 'applicant@example.com', role: 'student' };
const STUDENT: SessionUser = { id: 'student-1', name: 'Stu Dent', email: 'student@example.com', role: 'student' };

let fake: FakeDb;

function seedUser(id: string, role: string, extra: Record<string, unknown> = {}) {
  fake.seed('User', [
    {
      id,
      name: `User ${id}`,
      email: `${id}@example.com`,
      passwordHash: HASH,
      role,
      status: 'active',
      joinedAt: new Date('2024-01-01'),
      ...extra,
    },
  ]);
}

const APPLICANT_FORM = {
  name: 'App Licant',
  email: 'applicant@example.com',
  expertise: 'Web Development',
  experience: '3 years',
  message: 'I want to teach',
  whyGoodFit: 'I love teaching',
  linkedinUrl: 'https://linkedin.com/in/applicant',
  cvUrl: 'cvs/app.pdf',
  demoRecordingUrl: 'demos/app.mp4',
};

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedUser('admin-1', 'admin', { isAdmin: true });
  seedUser('teacher-1', 'instructor', { isTeacher: true });
  seedUser('applicant-1', 'student', { email: 'applicant@example.com' });
  seedUser('student-1', 'student');
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

async function makeApplicantApplication() {
  const result = await createApplicantApplication(
    { id: 'applicant-1', role: 'student' },
    { ...APPLICANT_FORM },
  );
  assert.ok(!('error' in result), JSON.stringify(result));
  return result.application;
}

// ---------------------------------------------------------------------------
// Applicant portal guard + tracking view
// ---------------------------------------------------------------------------

test('portal guard: the owner can open tracking; a non-applicant (or another user) gets 404', async () => {
  const app = await makeApplicantApplication();
  const own = await getApplicantTracking({ id: 'applicant-1', role: 'student' }, app.id);
  assert.ok(!('error' in own));
  assert.equal(own.tracking.application.id, app.id);
  assert.equal(own.tracking.currentStage.name, 'Submitted');

  // Another user — even a student with no application — learns nothing.
  const stranger = await getApplicantTracking({ id: 'student-1', role: 'student' }, app.id);
  assert.ok('error' in stranger);
  assert.equal(stranger.status, 404);

  // An admin cannot use the applicant path for someone else's application either.
  const admin = await getApplicantTracking(ADMIN_ACTOR, app.id);
  assert.ok('error' in admin);
  assert.equal(admin.status, 404);
});

test('tracking API hides unassigned future stages: only current + completed + next', async () => {
  const app = await makeApplicantApplication();
  const stages = await ensureDefaultStages();
  const underReview = stages.find((s) => s.name === 'Under Review');
  assert.ok(underReview);
  const moved = await assignStage(ADMIN_ACTOR, app.id, underReview.id);
  assert.ok(!('error' in moved));

  const view = await getApplicantTracking({ id: 'applicant-1', role: 'student' }, app.id);
  assert.ok(!('error' in view));
  const tracking = view.tracking;
  assert.equal(tracking.currentStage.name, 'Under Review');
  assert.deepEqual(tracking.completedStages, ['Submitted', 'Under Review']);
  // The single next stage only — 'Teaching Demo' and everything after
  // it must never appear anywhere in the payload.
  assert.equal(tracking.nextStage?.name, 'Interview Scheduled');
  const serialised = JSON.stringify(tracking);
  assert.ok(!serialised.includes('Teaching Demo'), 'future stage leaked');
  assert.ok(!serialised.includes('Waiting for Approval'), 'future stage leaked');
  assert.ok(!serialised.includes('Successfully Onboarded'), 'future stage leaked');
  assert.ok(!('stages' in tracking), 'full pipeline must not be returned');
  assert.ok(!('notes' in tracking), 'internal notes must not be returned');

  // The pure builder enforces the same shape without the service.
  const built = buildApplicantTrackingView({
    application: app,
    history: [{ id: 'h1', applicationId: app.id, stageName: 'Under Review', action: 'stage_assigned', createdAt: '2026-01-01' }],
    stages,
    notifications: [],
  });
  assert.equal(built.nextStage?.name, 'Interview Scheduled');
  assert.ok(!JSON.stringify(built).includes('Teaching Demo'));
});

test('tracking route: a non-owner gets 404 from the API route itself', async () => {
  const app = await makeApplicantApplication();
  const { GET } = await import('../app/api/applicant/applications/[id]/route');
  __setTestSession({ id: 'student-1', name: 'Stu', email: 'student@example.com', role: 'student' });
  const res = await GET(new NextRequest(`http://localhost/api/applicant/applications/${app.id}`), {
    params: Promise.resolve({ id: app.id }),
  });
  assert.equal(res.status, 404);
  __setTestSession(APPLICANT);
  const own = await GET(new NextRequest(`http://localhost/api/applicant/applications/${app.id}`), {
    params: Promise.resolve({ id: app.id }),
  });
  assert.equal(own.status, 200);
});

// ---------------------------------------------------------------------------
// Stage transitions: history + audit + applicant notification
// ---------------------------------------------------------------------------

test('stage transition writes history + audit and notifies the applicant', async () => {
  const app = await makeApplicantApplication();
  const stages = await ensureDefaultStages();
  const demo = stages.find((s) => s.name === 'Teaching Demo');
  assert.ok(demo);
  const before = await getAuditLog();
  const result = await assignStage(ADMIN_ACTOR, app.id, demo.id, 'Demo on Thursday');
  assert.ok(!('error' in result));
  assert.equal(result.history.action, 'stage_assigned');
  assert.equal(result.history.stageName, 'Teaching Demo');

  const current = await getCurrentStage(app.id);
  assert.equal(current?.stageName, 'Teaching Demo');
  const audit = await getAuditLog();
  assert.ok(audit.length > before.length);
  assert.ok(audit.some((e) => e.action === 'application.stage' && e.entityId === app.id));
  const notes = await listNotificationsForUser('applicant-1');
  assert.ok(notes.items.some((n) => n.type === 'application' && n.title.includes('Teaching Demo')));
});

test('request-info writes history + audit and notifies the applicant; it does not change status', async () => {
  const app = await makeApplicantApplication();
  const result = await requestInfo(ADMIN_ACTOR, app.id, 'Please send a longer demo recording');
  assert.ok(!('error' in result));
  assert.equal(result.history.action, 'info_requested');
  assert.equal(result.history.note, 'Please send a longer demo recording');
  const audit = await getAuditLog();
  assert.ok(audit.some((e) => e.action === 'application.info_requested' && e.entityId === app.id));
  const notes = await listNotificationsForUser('applicant-1');
  assert.ok(notes.items.some((n) => n.body.includes('longer demo recording')));
  const mine = await listMyApplications({ id: 'applicant-1', role: 'student' });
  assert.equal(mine.applications[0].status, 'pending');
});

test('review writes history and notifies the applicant (in addition to the admins)', async () => {
  const app = await makeApplicantApplication();
  const reviewed = await reviewApplicationService(ADMIN_ACTOR, app.id, 'approved');
  assert.ok(!('error' in reviewed));
  const current = await getCurrentStage(app.id);
  assert.equal(current?.stageName, 'Approved');
  assert.equal(current?.action, 'approved');
  const notes = await listNotificationsForUser('applicant-1');
  assert.ok(notes.items.some((n) => n.title.toLowerCase().includes('approved')));
});

test('assignStage refuses terminal stages and non-pending applications', async () => {
  const app = await makeApplicantApplication();
  const stages = await ensureDefaultStages();
  const onboarded = stages.find((s) => s.name === 'Successfully Onboarded');
  const rejected = stages.find((s) => s.name === 'Rejected');
  assert.ok(onboarded && rejected);
  const viaOnboard = await assignStage(ADMIN_ACTOR, app.id, onboarded.id);
  assert.ok('error' in viaOnboard);
  assert.equal(viaOnboard.status, 400);
  const viaReject = await assignStage(ADMIN_ACTOR, app.id, rejected.id);
  assert.ok('error' in viaReject);
  assert.equal(viaReject.status, 400);
  const byTeacher = await assignStage({ id: 'teacher-1', role: 'instructor', isTeacher: true }, app.id, stages[1].id);
  assert.ok('error' in byTeacher);
  assert.equal(byTeacher.status, 403);
});

// ---------------------------------------------------------------------------
// Duplicate rule
// ---------------------------------------------------------------------------

test('duplicate rule: one pending application at a time; a decided one does not block a fresh one', async () => {
  await makeApplicantApplication();
  const gate = await canCreateNewApplication('applicant-1');
  assert.equal(gate.allowed, false);
  const second = await createApplicantApplication({ id: 'applicant-1', role: 'student' }, { ...APPLICANT_FORM });
  assert.ok('error' in second);
  assert.equal(second.status, 409);

  // After a decision (rejected here), a fresh application is allowed.
  const apps = await listMyApplications({ id: 'applicant-1', role: 'student' });
  const rejected = await reviewApplicationService(ADMIN_ACTOR, apps.applications[0].id, 'rejected');
  assert.ok(!('error' in rejected));
  assert.equal((await canCreateNewApplication('applicant-1')).allowed, true);
  const fresh = await createApplicantApplication({ id: 'applicant-1', role: 'student' }, { ...APPLICANT_FORM });
  assert.ok(!('error' in fresh));
});

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

test('onboarding sets the teacher flag without a new account or a password change', async () => {
  const app = await makeApplicantApplication();
  const before = await getUserByIdWithHash('applicant-1');
  assert.ok(before);
  const userCountBefore = fake.tables['User'].size;
  const reviewed = await reviewApplicationService(ADMIN_ACTOR, app.id, 'approved');
  assert.ok(!('error' in reviewed));

  const result = await onboardApplication(ADMIN_ACTOR, app.id);
  assert.ok(!('error' in result));
  assert.equal(result.user.id, 'applicant-1');
  assert.equal(result.user.isTeacher, true);
  assert.equal(result.user.role, 'instructor');

  // Same account, same credentials: no new user, same password hash.
  assert.equal(fake.tables['User'].size, userCountBefore);
  const after = await getUserByIdWithHash('applicant-1');
  assert.ok(after);
  assert.equal(after.passwordHash, before.passwordHash);
  assert.equal(after.isTeacher, true);
  assert.equal(after.role, 'instructor');

  // History + audit + applicant notification record the onboarding.
  const current = await getCurrentStage(app.id);
  assert.equal(current?.stageName, 'Successfully Onboarded');
  assert.equal(current?.action, 'onboarded');
  const audit = await getAuditLog();
  assert.ok(audit.some((e) => e.action === 'application.onboard' && e.entityId === app.id));
  const notes = await listNotificationsForUser('applicant-1');
  assert.ok(notes.items.some((n) => n.title.includes('now a teacher')));

  // Onboarding twice is a conflict, not a second flag flip.
  const again = await onboardApplication(ADMIN_ACTOR, app.id);
  assert.ok('error' in again);
  assert.equal(again.status, 409);
});

test('onboarding requires an approved application with an account', async () => {
  const app = await makeApplicantApplication();
  const pending = await onboardApplication(ADMIN_ACTOR, app.id);
  assert.ok('error' in pending);
  assert.equal(pending.status, 400);

  const noAccount = await createApplication({ name: 'Ghost', email: 'ghost@example.com' });
  const reviewed = await reviewApplicationService(ADMIN_ACTOR, noAccount.id, 'approved');
  assert.ok(!('error' in reviewed));
  const blocked = await onboardApplication(ADMIN_ACTOR, noAccount.id);
  assert.ok('error' in blocked);
  assert.equal(blocked.status, 400);
});

// ---------------------------------------------------------------------------
// Custom stages
// ---------------------------------------------------------------------------

test('custom stage CRUD works and history survives a stage delete', async () => {
  const seeded = await ensureDefaultStages();
  assert.equal(seeded.length, 8);
  assert.deepEqual(
    seeded.map((s) => s.name),
    ['Submitted', 'Under Review', 'Interview Scheduled', 'Teaching Demo', 'Waiting for Approval', 'Onboarding', 'Successfully Onboarded', 'Rejected'],
  );

  const created = await createStage({ name: 'Reference Check', position: 99 });
  assert.equal(created.name, 'Reference Check');
  const renamed = await updateStage(created.id, { name: 'References Checked', instructions: 'Call two references' });
  assert.equal(renamed?.name, 'References Checked');
  assert.equal(renamed?.instructions, 'Call two references');

  const reordered = await reorderStages([
    { id: created.id, position: 1 },
    ...seeded.map((s, i) => ({ id: s.id, position: i + 2 })),
  ]);
  assert.equal(reordered[0].name, 'References Checked');

  const app = await makeApplicantApplication();
  const moved = await assignStage(ADMIN_ACTOR, app.id, created.id);
  assert.ok(!('error' in moved));
  assert.equal(await deleteStage(created.id), true);
  assert.deepEqual((await listStages()).map((s) => s.name).includes('References Checked'), false);
  const current = await getCurrentStage(app.id);
  assert.equal(current?.stageName, 'References Checked');
});

// ---------------------------------------------------------------------------
// Admin-assisted view-as
// ---------------------------------------------------------------------------

test('view-as tokens verify, and forged or expired tokens fail', () => {
  const { token, expiresAt } = mintViewAsToken('admin-1', 'teacher-1', 1_000_000);
  const payload = verifyViewAsToken(token, 1_000_100);
  assert.ok(payload);
  assert.equal(payload.adminId, 'admin-1');
  assert.equal(payload.teacherId, 'teacher-1');
  assert.equal(payload.expiresAt, expiresAt);

  // Tampered payload.
  assert.equal(verifyViewAsToken(`${token.slice(0, 10)}x${token.slice(11)}`, 1_000_100), null);
  // Expired.
  assert.equal(verifyViewAsToken(token, expiresAt + 1), null);
  // Garbage.
  assert.equal(verifyViewAsToken('not-a-token'), null);
  assert.equal(verifyViewAsToken(null), null);
});

test('view-as: a teacher can be viewed (audit-logged); a student cannot; self-view is refused', async () => {
  const before = await getAuditLog();
  const ok = await startViewAs(ADMIN_ACTOR, 'teacher-1');
  assert.ok(!('error' in ok));
  assert.equal(ok.teacher.id, 'teacher-1');
  assert.ok(ok.token.length > 0);
  const audit = await getAuditLog();
  assert.ok(audit.length > before.length);
  assert.ok(audit.some((e) => e.action === 'admin.view_as.start' && e.entityId === 'teacher-1'));

  const student = await startViewAs(ADMIN_ACTOR, 'student-1');
  assert.ok('error' in student);
  assert.equal(student.status, 403);

  const self = await startViewAs(ADMIN_ACTOR, 'admin-1');
  assert.ok('error' in self);

  const byTeacher = await startViewAs({ id: 'teacher-1', role: 'instructor', isTeacher: true }, 'teacher-1');
  assert.ok('error' in byTeacher);
  assert.equal(byTeacher.status, 403);
});

test('view-as is view-only: a viewing session is blocked from mutations, a normal session is not', async () => {
  const viewing: SessionUser = { ...TEACHER, viewAs: { adminId: 'admin-1', adminName: 'Admin' } };
  const blocked = assertNotViewAs(viewing);
  assert.ok(blocked);
  assert.equal(blocked.status, 403);
  assert.equal(assertNotViewAs(TEACHER), null);
  assert.equal(assertNotViewAs(null), null);

  // Wired into a real write route: creating a quiz while viewing is 403
  // before any body validation runs.
  const { POST } = await import('../app/api/instructor/quizzes/route');
  __setTestSession(viewing);
  const res = await POST(
    new NextRequest('http://localhost/api/instructor/quizzes', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  assert.equal(res.status, 403);
});
