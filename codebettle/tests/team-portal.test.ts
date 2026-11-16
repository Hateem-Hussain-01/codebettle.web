/**
 * Team Portal (Eman, 16 Nov 2026) — the 4th portal, for the CodeBettle
 * team (About Us people EXCEPT teachers: management + department
 * heads).
 *
 * - Access is by email grant (TeamAccess), revocable; members sign in
 *   with their OWN email + password — no shared secret, no shared
 *   password. A grant made before the account exists links by email
 *   on login/register.
 * - Landing priority: admin > teacher > team > student.
 * - The portal is hidden: no public link, noindex, robots disallow.
 * - Fail-safe: until Eman runs codebettle-team-portal-migration.sql,
 *   every team read returns empty and the portal shows a friendly
 *   "not set up yet" notice instead of a 500.
 *
 * Repo/service tests run against the fake DB; the layout guard and
 * hidden-ness are asserted by source inspection, following the Phase
 * 6 design-test pattern (tests/phase6-design.test.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession, requireTeamMember } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { landingDashboardUrl } from '../lib/admin-url';
import { getPortalSwitch, portalFromPathname } from '../lib/portal-switch';
import {
  createTeamAnnouncement,
  createTeamMeeting,
  createTeamTask,
  grantTeamAccess,
  getTeamAccessByEmail,
  getTeamAccessByUserId,
  hasTeamAccess,
  isMissingTeamTableError,
  isTeamTableReady,
  linkTeamAccessToUserByEmail,
  listTeamAnnouncements,
  listTeamMeetings,
  listTeamTasks,
  listUpcomingTeamMeetings,
  moveTeamTaskStatus,
  revokeTeamAccess,
  TEAM_TABLE_MISSING_MESSAGE,
} from '../lib/db/team';
import { PATCH as moveTask } from '../app/api/team/tasks/[id]/route';
import { POST as adminCreateTask } from '../app/api/admin/team/tasks/route';
import type { SessionUser } from '../lib/services/auth-service';

const D = (s: string) => new Date(s);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin', isAdmin: true };
const TEACHER: SessionUser = { id: 'teacher-1', name: 'Usman', email: 'usman@codebettle.com', role: 'instructor', isTeacher: true };
const MEMBER: SessionUser = { id: 'member-1', name: 'Maryam', email: 'maryam@codebettle.com', role: 'student' };
const MEMBER2: SessionUser = { id: 'member-2', name: 'Bilal', email: 'bilal@codebettle.com', role: 'student' };
const STUDENT: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function reset() {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  __setTestSession(null);
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: 'x', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'teacher-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: 'x', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'member-1', name: 'Maryam', email: 'maryam@codebettle.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'member-2', name: 'Bilal', email: 'bilal@codebettle.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
}

test.beforeEach(() => reset());
test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ---------------------------------------------------------------------------
// (a) Layout guard — team access decides who gets in; admins do NOT pass
// by virtue of being admins.
// ---------------------------------------------------------------------------

test('team gate: no session -> 401, non-team user -> 403, team member passes, admin without a grant -> 403', async () => {
  __setTestSession(null);
  const anon = await requireTeamMember();
  assert.ok('error' in anon && anon.error.status === 401);

  __setTestSession(STUDENT);
  const student = await requireTeamMember();
  assert.ok('error' in student && student.error.status === 403);

  __setTestSession(ADMIN);
  const admin = await requireTeamMember();
  assert.ok('error' in admin && admin.error.status === 403);

  await grantTeamAccess({ email: MEMBER.email, grantedBy: ADMIN.id });
  __setTestSession(MEMBER);
  const ok = await requireTeamMember();
  assert.ok(!('error' in ok));
  assert.equal(ok.session.id, MEMBER.id);
});

test('team layout: guards by team access, redirects the unauthorised to login, carries noindex', () => {
  const layout = read('app/team/layout.tsx');
  assert.match(layout, /hasTeamAccess\(session\)/);
  assert.match(layout, /redirect\('\/auth\/login'\)/);
  assert.match(layout, /robots:\s*\{\s*index:\s*false/);
  assert.match(layout, /not set up yet/);
  // Admins do NOT pass the team guard by virtue of being admins.
  assert.doesNotMatch(layout, /hasAdminCapability\(session\)/);
});

// ---------------------------------------------------------------------------
// (b) Landing priority: admin > teacher > team > student.
// ---------------------------------------------------------------------------

test('landing priority is admin, then teacher, then team, then student', () => {
  assert.equal(
    landingDashboardUrl({ role: 'admin', isAdmin: true, isTeacher: true, hasTeamAccess: true }),
    '/admin/dashboard',
  );
  assert.equal(
    landingDashboardUrl({ role: 'instructor', isTeacher: true, hasTeamAccess: true }),
    '/instructor/dashboard',
  );
  // A student-primary user with the teacher flag lands on the teacher portal.
  assert.equal(
    landingDashboardUrl({ role: 'student', isTeacher: true, hasTeamAccess: true }),
    '/instructor/dashboard',
  );
  // A pure team member lands on the team portal.
  assert.equal(
    landingDashboardUrl({ role: 'student', hasTeamAccess: true }),
    '/team/dashboard',
  );
  // A plain student lands on the student portal.
  assert.equal(landingDashboardUrl({ role: 'student' }), '/student/dashboard');
  assert.equal(landingDashboardUrl({ role: 'student', hasTeamAccess: false }), '/student/dashboard');
});

test('portal switcher: team users can move between their portals', () => {
  assert.equal(portalFromPathname('/team/dashboard'), 'team');
  assert.equal(portalFromPathname('/team/tasks'), 'team');
  // From the team portal: admin first, then teacher, then student.
  assert.deepEqual(getPortalSwitch(ADMIN, '/team/dashboard', 'admin', true), {
    target: 'admin',
    href: '/admin/dashboard',
    label: 'Switch to Admin Panel',
  });
  assert.deepEqual(getPortalSwitch(TEACHER, '/team/dashboard', 'admin', true), {
    target: 'instructor',
    href: '/instructor/dashboard',
    label: 'Switch to Teacher Portal',
  });
  assert.deepEqual(getPortalSwitch(MEMBER, '/team/dashboard', 'admin', true), {
    target: 'student',
    href: '/student/dashboard',
    label: 'Switch to Student Portal',
  });
  // From the other portals into the team portal.
  assert.deepEqual(getPortalSwitch(MEMBER, '/student/dashboard', 'admin', true), {
    target: 'team',
    href: '/team/dashboard',
    label: 'Switch to Team Portal',
  });
  assert.deepEqual(getPortalSwitch(TEACHER, '/instructor/dashboard', 'admin', true), {
    target: 'team',
    href: '/team/dashboard',
    label: 'Switch to Team Portal',
  });
  // No team access, no switch to the team portal.
  assert.equal(getPortalSwitch(MEMBER, '/student/dashboard', 'admin', false), null);
  assert.equal(getPortalSwitch(STUDENT, '/student/dashboard', 'admin', false), null);
});

// ---------------------------------------------------------------------------
// (c) Grant / revoke by email + link-up on login.
// ---------------------------------------------------------------------------

test('grant by email: idempotent, links the account when one exists, pending grants link on sign-in', async () => {
  const grant = await grantTeamAccess({ email: MEMBER.email, grantedBy: ADMIN.id });
  assert.equal(grant.email, MEMBER.email);
  assert.equal(grant.status, 'active');
  assert.equal(grant.userId, MEMBER.id);
  assert.equal(await hasTeamAccess(MEMBER), true);

  // Idempotent: a second grant returns the same row, no duplicate.
  const again = await grantTeamAccess({ email: '  MARYAM@codebettle.com ', grantedBy: ADMIN.id });
  assert.equal(again.id, grant.id);
  assert.equal((await fake.tables.TeamAccess)!.size, 1);

  // Pending grant: no account yet — userId stays null.
  const pending = await grantTeamAccess({ email: 'new@codebettle.com', grantedBy: ADMIN.id });
  assert.equal(pending.userId, undefined);

  // Link-up on sign-in: the new account links by email.
  const linked = await linkTeamAccessToUserByEmail('new@codebettle.com', 'user-new');
  assert.equal(linked?.userId, 'user-new');
  assert.equal((await getTeamAccessByUserId('user-new'))?.email, 'new@codebettle.com');

  // Link-up never steals a row linked to someone else.
  const stolen = await linkTeamAccessToUserByEmail('maryam@codebettle.com', 'someone-else');
  assert.equal(stolen, null);
  assert.equal((await getTeamAccessByEmail('maryam@codebettle.com'))?.userId, MEMBER.id);
});

test('revoke: access is lost immediately, the row stays, re-grant reactivates it', async () => {
  await grantTeamAccess({ email: MEMBER.email, grantedBy: ADMIN.id });
  assert.equal(await hasTeamAccess(MEMBER), true);

  const revoked = await revokeTeamAccess(MEMBER.email);
  assert.equal(revoked?.status, 'revoked');
  assert.ok(revoked?.revokedAt);
  assert.equal(await hasTeamAccess(MEMBER), false);
  // The row stays for audit.
  assert.notEqual(await getTeamAccessByEmail(MEMBER.email), null);

  // Revoking an unknown email returns null.
  assert.equal(await revokeTeamAccess('nobody@codebettle.com'), null);

  // Re-grant reactivates the same row.
  const regranted = await grantTeamAccess({ email: MEMBER.email, grantedBy: ADMIN.id });
  assert.equal(regranted.status, 'active');
  assert.equal((await fake.tables.TeamAccess)!.size, 1);
});

// ---------------------------------------------------------------------------
// (d) Task status transitions + role checks.
// ---------------------------------------------------------------------------

async function seedTask() {
  return createTeamTask({
    title: 'Prepare the onboarding doc',
    description: 'Draft v1',
    assigneeEmail: MEMBER.email,
    createdBy: ADMIN.id,
  });
}

test('task moves: assignee moves one step forward only; others and skips are refused', async () => {
  const task = await seedTask();

  // The assignee moves todo -> doing -> done.
  const doing = await moveTeamTaskStatus(task.id, 'doing', { id: MEMBER.id, email: MEMBER.email, isAdmin: false });
  assert.equal(doing?.status, 'doing');
  const done = await moveTeamTaskStatus(task.id, 'done', { id: MEMBER.id, email: MEMBER.email, isAdmin: false });
  assert.equal(done?.status, 'done');

  // Done is terminal for members.
  assert.equal(await moveTeamTaskStatus(task.id, 'todo', { id: MEMBER.id, email: MEMBER.email, isAdmin: false }), null);

  // Skipping a step is refused.
  const task2 = await seedTask();
  assert.equal(await moveTeamTaskStatus(task2.id, 'done', { id: MEMBER.id, email: MEMBER.email, isAdmin: false }), null);

  // Another member cannot move it.
  assert.equal(await moveTeamTaskStatus(task2.id, 'doing', { id: MEMBER2.id, email: MEMBER2.email, isAdmin: false }), null);

  // A non-assignee teacher cannot move it either.
  assert.equal(await moveTeamTaskStatus(task2.id, 'doing', { id: TEACHER.id, email: TEACHER.email, isAdmin: false }), null);

  // An admin can set any status.
  const adminMoved = await moveTeamTaskStatus(task2.id, 'done', { id: ADMIN.id, email: ADMIN.email, isAdmin: true });
  assert.equal(adminMoved?.status, 'done');
});

test('task move route: member moves their own task, others get 403', async () => {
  await grantTeamAccess({ email: MEMBER.email, grantedBy: ADMIN.id });
  await grantTeamAccess({ email: MEMBER2.email, grantedBy: ADMIN.id });
  const task = await seedTask();

  __setTestSession(MEMBER);
  const ok = await moveTask(
    jsonReq(`http://localhost/api/team/tasks/${task.id}`, 'PATCH', { status: 'doing' }),
    { params: Promise.resolve({ id: task.id }) },
  );
  assert.equal(ok.status, 200);
  assert.equal((await ok.json() as { task: { status: string } }).task.status, 'doing');

  // Another member gets 403.
  __setTestSession(MEMBER2);
  const forbidden = await moveTask(
    jsonReq(`http://localhost/api/team/tasks/${task.id}`, 'PATCH', { status: 'done' }),
    { params: Promise.resolve({ id: task.id }) },
  );
  assert.equal(forbidden.status, 403);

  // A signed-out visitor gets 401.
  __setTestSession(null);
  const anon = await moveTask(
    jsonReq(`http://localhost/api/team/tasks/${task.id}`, 'PATCH', { status: 'done' }),
    { params: Promise.resolve({ id: task.id }) },
  );
  assert.equal(anon.status, 401);
});

test('members cannot create tasks: the admin tasks route refuses non-admins', async () => {
  __setTestSession(MEMBER);
  const asMember = await adminCreateTask(
    jsonReq('http://localhost/api/admin/team/tasks', 'POST', {
      title: 'Sneaky task',
      assigneeEmail: MEMBER.email,
    }),
  );
  assert.equal(asMember.status, 403);

  __setTestSession(ADMIN);
  const asAdmin = await adminCreateTask(
    jsonReq('http://localhost/api/admin/team/tasks', 'POST', {
      title: 'Real task',
      assigneeEmail: MEMBER.email,
    }),
  );
  assert.equal(asAdmin.status, 201);
  assert.equal((await asAdmin.json() as { task: { title: string } }).task.title, 'Real task');
});

// ---------------------------------------------------------------------------
// (e) Hidden-ness: no public /team link anywhere; noindex + robots.
// ---------------------------------------------------------------------------

test('team portal is hidden: no /team link in navbar, footer or sitemap; robots disallows it', () => {
  const navbar = read('components/layout/Navbar.tsx');
  const footer = read('components/layout/Footer.tsx');
  const sitemap = read('app/sitemap.ts');
  const robots = read('app/robots.ts');
  for (const [name, src] of [
    ['Navbar', navbar],
    ['Footer', footer],
    ['sitemap', sitemap],
  ] as const) {
    assert.doesNotMatch(src, /\/team\b/, `${name} must not link to the team portal`);
  }
  assert.match(robots, /'\/team\/'/);
  // The admin Team section is internal (sidebar), not a public link.
  assert.match(read('lib/admin-access.ts'), /href: '\/admin\/team'/);
});

// ---------------------------------------------------------------------------
// (f) Fail-safe when the team tables / bucket are missing.
// ---------------------------------------------------------------------------

test('missing-table errors are recognised for every team table', () => {
  for (const table of ['TeamAccess', 'TeamTask', 'TeamAnnouncement', 'TeamMeeting', 'TeamFile']) {
    assert.equal(
      isMissingTeamTableError({ code: '42P01', message: `relation "public"."${table}" does not exist` }),
      true,
    );
  }
  assert.equal(isMissingTeamTableError({ code: '42P01', message: 'relation "public"."User" does not exist' }), false);
  assert.equal(isMissingTeamTableError({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(isMissingTeamTableError(null), false);
});

test('before the migration runs: every team read is empty, access is false, no throw', async () => {
  assert.deepEqual(await listTeamTasks(), []);
  assert.deepEqual(await listTeamAnnouncements(), []);
  assert.deepEqual(await listTeamMeetings(), []);
  assert.deepEqual(await listUpcomingTeamMeetings(), []);
  assert.equal(await hasTeamAccess(MEMBER), false);
  assert.equal(await isTeamTableReady(), true); // the fake always has the table
  assert.match(TEAM_TABLE_MISSING_MESSAGE, /codebettle-team-portal-migration\.sql/);
});

test('announcements and meetings round-trip (admin creates, team reads)', async () => {
  const ann = await createTeamAnnouncement({ title: 'All-hands Friday', body: 'Be there.', createdBy: ADMIN.id });
  assert.equal(ann.title, 'All-hands Friday');
  assert.equal((await listTeamAnnouncements()).length, 1);

  const meeting = await createTeamMeeting({
    title: 'Weekly sync',
    startsAt: D('2026-11-20T14:00:00.000Z').toISOString(),
    meetingLink: 'https://meet.example.com/abc',
    createdBy: ADMIN.id,
  });
  // The meeting TIME survives the mapping (full ISO, not date-only).
  assert.equal(meeting.startsAt, '2026-11-20T14:00:00.000Z');
  assert.equal((await listUpcomingTeamMeetings(D('2026-11-19T00:00:00.000Z'))).length, 1);
  assert.equal((await listUpcomingTeamMeetings(D('2026-11-21T00:00:00.000Z'))).length, 0);
});
