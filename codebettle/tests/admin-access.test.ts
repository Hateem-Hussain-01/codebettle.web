import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_AREAS,
  areaForAdminPath,
  firstGrantedArea,
  hasAdminArea,
  isFullAdmin,
  normaliseAdminPermissions,
  toAdminPermissions,
} from '../lib/admin-access';
import { __resetTestSession, __setTestSession, requireAdminArea, requireFullAdmin } from '../lib/api-helpers';
import { toSessionUser } from '../lib/services/auth-service';
import {
  listAccessUsers,
  revokeAdminAccess,
  updateAdminAccess,
} from '../lib/services/admin-access-service';
import { getUserById } from '../lib/db/users';
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
  // Phase 5: only a SUPER-ADMIN (an official administrator email) may
  // grant/revoke/list admin access. 'super-admin' is the official
  // Muhammad Hateem Hussain; 'admin-full' is a non-official full admin
  // and must now be refused everywhere the old gate let them through.
  seedUser('super-admin', 'admin', { email: 'mhateemjutt1412@gmail.com', isAdmin: true });
  seedUser('admin-full', 'admin');
  seedUser('admin-restricted', 'admin', { adminPermissions: { courses: true, students: true } });
  seedUser('student-1', 'student');
  seedUser('instructor-1', 'instructor');
  seedUser('suspended-1', 'student', { status: 'suspended' });
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('survey: the checkbox list covers all 18 admin areas, in sidebar order', () => {
  assert.deepEqual(
    ADMIN_AREAS.map((a) => a.key),
    [
      'dashboard', 'courses', 'students', 'instructors', 'enrollments',
      'coupons', 'announcements', 'messages', 'requests', 'notifications', 'communications', 'blog',
      'content', 'reports', 'certificates', 'applications', 'forms', 'settings',
    ],
  );
  assert.equal(new Set(ADMIN_AREAS.map((a) => a.key)).size, 18);
});

test('toAdminPermissions: NULL means full admin; unknown/non-boolean keys are dropped', () => {
  assert.equal(toAdminPermissions(null), undefined);
  assert.equal(toAdminPermissions(undefined), undefined);
  assert.equal(toAdminPermissions('nope'), undefined);
  assert.deepEqual(toAdminPermissions({ courses: true, students: false, bogus: true, blog: 'yes' }), {
    courses: true,
    students: false,
  });
});

test('hasAdminArea: full admin gets everything; restricted gets only granted areas', () => {
  assert.equal(hasAdminArea(undefined, 'settings'), true);
  assert.equal(hasAdminArea(null, 'settings'), true);
  assert.equal(hasAdminArea({ courses: true }, 'courses'), true);
  assert.equal(hasAdminArea({ courses: true }, 'students'), false);
  assert.equal(hasAdminArea({}, 'dashboard'), false);
});

test('isFullAdmin is true only when there is no restriction at all', () => {
  assert.equal(isFullAdmin(undefined), true);
  assert.equal(isFullAdmin({}), false);
});

test('areaForAdminPath maps every sub-page to its parent area', () => {
  assert.equal(areaForAdminPath('/admin/dashboard'), 'dashboard');
  assert.equal(areaForAdminPath('/admin/courses'), 'courses');
  assert.equal(areaForAdminPath('/admin/courses/new'), 'courses');
  assert.equal(areaForAdminPath('/admin/courses/abc123'), 'courses');
  assert.equal(areaForAdminPath('/admin/students/import'), 'students');
  assert.equal(areaForAdminPath('/admin/students'), 'students');
  assert.equal(areaForAdminPath('/admin/instructors'), 'instructors');
  assert.equal(areaForAdminPath('/admin/enrollments'), 'enrollments');
  assert.equal(areaForAdminPath('/admin/coupons'), 'coupons');
  assert.equal(areaForAdminPath('/admin/announcements'), 'announcements');
  assert.equal(areaForAdminPath('/admin/messages'), 'messages');
  assert.equal(areaForAdminPath('/admin/notifications'), 'notifications');
  assert.equal(areaForAdminPath('/admin/blog'), 'blog');
  assert.equal(areaForAdminPath('/admin/content'), 'content');
  assert.equal(areaForAdminPath('/admin/reports'), 'reports');
  assert.equal(areaForAdminPath('/admin/certificates'), 'certificates');
  assert.equal(areaForAdminPath('/admin/applications'), 'applications');
  assert.equal(areaForAdminPath('/admin/settings'), 'settings');
  assert.equal(areaForAdminPath('/admin/access'), 'access');
  assert.equal(areaForAdminPath('/admin'), null);
  assert.equal(areaForAdminPath('/admin/nope'), null);
});

test('firstGrantedArea returns the first granted area, or null when none', () => {
  assert.equal(firstGrantedArea(undefined)?.key, 'dashboard');
  assert.equal(firstGrantedArea({ reports: true })?.key, 'reports');
  assert.equal(firstGrantedArea({}), null);
});

test('normaliseAdminPermissions: all areas collapse to full admin; none stays empty', () => {
  const all = Object.fromEntries(ADMIN_AREAS.map((a) => [a.key, true]));
  assert.equal(normaliseAdminPermissions(all), undefined);
  assert.deepEqual(normaliseAdminPermissions({}), {});
  assert.deepEqual(normaliseAdminPermissions({ courses: true, bogus: true }), { courses: true });
});

// ---------------------------------------------------------------------------
// API guards (session seam)
// ---------------------------------------------------------------------------

test('requireAdminArea: full admin passes every area; restricted only their areas', async () => {
  __setTestSession({ id: 'admin-restricted', name: 'R', email: 'r@example.com', role: 'admin', adminPermissions: { courses: true } });
  const ok = await requireAdminArea('courses');
  assert.ok(!('error' in ok));
  const denied = await requireAdminArea('students');
  assert.ok('error' in denied);
  assert.equal(denied.error.status, 403);

  __setTestSession({ id: 'admin-full', name: 'F', email: 'f@example.com', role: 'admin' });
  const fullOk = await requireAdminArea('settings');
  assert.ok(!('error' in fullOk));

  __setTestSession({ id: 'student-1', name: 'S', email: 's@example.com', role: 'student' });
  const student = await requireAdminArea('courses');
  assert.ok('error' in student);
  assert.equal(student.error.status, 403);

  __setTestSession(null);
  const anon = await requireAdminArea('courses');
  assert.ok('error' in anon);
  assert.equal(anon.error.status, 401);
});

test('requireFullAdmin: restricted admins are denied', async () => {
  __setTestSession({ id: 'admin-restricted', name: 'R', email: 'r@example.com', role: 'admin', adminPermissions: { courses: true } });
  const denied = await requireFullAdmin();
  assert.ok('error' in denied);
  assert.equal(denied.error.status, 403);

  __setTestSession({ id: 'admin-full', name: 'F', email: 'f@example.com', role: 'admin' });
  const ok = await requireFullAdmin();
  assert.ok(!('error' in ok));
});

test('toSessionUser carries adminPermissions from the user record', async () => {
  const user = await getUserById('admin-restricted');
  assert.ok(user);
  const session = toSessionUser(user);
  assert.deepEqual(session.adminPermissions, { courses: true, students: true });

  const full = await getUserById('admin-full');
  assert.ok(full);
  assert.equal(toSessionUser(full).adminPermissions, undefined);
});

// ---------------------------------------------------------------------------
// Access service
// ---------------------------------------------------------------------------

test('grant: a student becomes a restricted admin with exactly the checked areas', async () => {
  const result = await updateAdminAccess('super-admin', 'student-1', {
    permissions: { dashboard: true, courses: true, settings: false },
  });
  assert.ok(!('error' in result));
  // Phase 2: granting sets the isAdmin FLAG and preserves the primary
  // role — a student granted admin stays role 'student' (their home
  // portal) with admin capability from the flag.
  assert.equal(result.user.isAdmin, true);
  assert.equal(result.user.role, 'student');
  assert.deepEqual(result.user.adminPermissions, { dashboard: true, courses: true });

  const stored = await getUserById('student-1');
  assert.deepEqual(stored?.adminPermissions, { dashboard: true, courses: true });
});

test('grant: all areas checked grants FULL admin (NULL permissions)', async () => {
  const all = Object.fromEntries(ADMIN_AREAS.map((a) => [a.key, true]));
  const result = await updateAdminAccess('super-admin', 'student-1', { permissions: all });
  assert.ok(!('error' in result));
  assert.equal(result.user.isAdmin, true);
  assert.equal(result.user.role, 'student');
  assert.equal(result.user.adminPermissions, undefined);
});

test('grant: zero areas, unknown user, suspended user and non-super-admin actor are refused', async () => {
  const none = await updateAdminAccess('super-admin', 'student-1', { permissions: {} });
  assert.ok('error' in none);
  assert.equal(none.status, 400);

  const missing = await updateAdminAccess('super-admin', 'nobody', { permissions: { courses: true } });
  assert.ok('error' in missing);
  assert.equal(missing.status, 404);

  const suspended = await updateAdminAccess('super-admin', 'suspended-1', { permissions: { courses: true } });
  assert.ok('error' in suspended);
  assert.equal(suspended.status, 400);

  const byStudent = await updateAdminAccess('student-1', 'instructor-1', { permissions: { courses: true } });
  assert.ok('error' in byStudent);
  assert.equal(byStudent.status, 403);

  const byRestricted = await updateAdminAccess('admin-restricted', 'instructor-1', { permissions: { courses: true } });
  assert.ok('error' in byRestricted);
  assert.equal(byRestricted.status, 403);

  // Phase 5: a non-official FULL admin can no longer grant.
  const byFullNonOfficial = await updateAdminAccess('admin-full', 'instructor-1', { permissions: { courses: true } });
  assert.ok('error' in byFullNonOfficial);
  assert.equal(byFullNonOfficial.status, 403);
});

test('self-edit is refused for both grant and revoke', async () => {
  const grant = await updateAdminAccess('super-admin', 'super-admin', { permissions: { courses: true } });
  assert.ok('error' in grant);
  assert.equal(grant.status, 403);

  const revoke = await revokeAdminAccess('super-admin', 'super-admin');
  assert.ok('error' in revoke);
  assert.equal(revoke.status, 403);
});

test('non-official full admin can no longer grant, revoke, or list (Phase 5)', async () => {
  const grant = await updateAdminAccess('admin-full', 'student-1', { permissions: { courses: true } });
  assert.ok('error' in grant);
  assert.equal(grant.status, 403);

  const revoke = await revokeAdminAccess('admin-full', 'admin-restricted');
  assert.ok('error' in revoke);
  assert.equal(revoke.status, 403);

  const list = await listAccessUsers('admin-full');
  assert.ok('error' in list);
  assert.equal(list.status, 403);
});

test('official target cannot be revoked by a non-official (Phase 5 defense-in-depth)', async () => {
  // The actor gate already refuses non-officials, so this also proves
  // the target check holds when the actor is not a super-admin.
  const revoke = await revokeAdminAccess('admin-full', 'super-admin');
  assert.ok('error' in revoke);
  assert.equal(revoke.status, 403);
  const stored = await getUserById('super-admin');
  assert.equal(stored?.isAdmin, true);
});

test('update: a restricted admin can gain and lose areas', async () => {
  const result = await updateAdminAccess('super-admin', 'admin-restricted', {
    permissions: { blog: true },
  });
  assert.ok(!('error' in result));
  assert.deepEqual(result.user.adminPermissions, { blog: true });
});

test('revoke: admin returns to student with permissions cleared', async () => {
  const result = await revokeAdminAccess('super-admin', 'admin-restricted');
  assert.ok(!('error' in result));
  assert.equal(result.user.role, 'student');
  assert.equal(result.user.adminPermissions, undefined);

  const stored = await getUserById('admin-restricted');
  assert.equal(stored?.role, 'student');
});

test('revoke: a non-admin cannot be revoked', async () => {
  const result = await revokeAdminAccess('super-admin', 'student-1');
  assert.ok('error' in result);
  assert.equal(result.status, 400);
});

test('listAccessUsers: super-admin sees all users; full non-official and restricted admins are refused', async () => {
  const ok = await listAccessUsers('super-admin');
  assert.ok(!('error' in ok));
  assert.equal(ok.users.length, 6);

  const deniedFull = await listAccessUsers('admin-full');
  assert.ok('error' in deniedFull);
  assert.equal(deniedFull.status, 403);

  const denied = await listAccessUsers('admin-restricted');
  assert.ok('error' in denied);
  assert.equal(denied.status, 403);
});
