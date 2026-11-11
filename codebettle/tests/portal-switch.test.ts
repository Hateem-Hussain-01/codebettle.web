/**
 * Module 17 — dual-role portal switching (Phase 2).
 *
 * Covers:
 * - Visibility matrix: who sees which switch option, and who sees none.
 * - Landing: the switch always lands on the other portal's dashboard.
 * - Backend enforcement (not just a hidden button): a pure teacher who
 *   manually navigates to /admin is denied, and a pure admin who
 *   manually navigates to /instructor is denied — tested through the
 *   same capability guards the server layouts use (app/admin/layout.tsx
 *   requires hasAdminCapability, app/instructor/layout.tsx requires
 *   hasTeacherCapability; both redirect to /auth/login when the check
 *   fails). The layouts themselves are server components and cannot be
 *   rendered in node, so the tests assert the guard decision via
 *   requireAdmin / requireRoles (same helpers, same predicates) AND
 *   assert by source inspection that both layouts still contain those
 *   guards and redirect.
 * - Session survival: switching is plain navigation (a <Link> to a
 *   dashboard href) — no logout, no session change, no client-sent role.
 *
 * PortalLayout itself cannot be rendered in node (it calls usePathname
 * from next/navigation, which needs the App Router mounted), so the
 * rendering wiring is asserted by source inspection, following the
 * Phase 6 design-test pattern (tests/phase6-design.test.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getPortalSwitch,
  portalFromPathname,
  primaryPortalDashboard,
} from '../lib/portal-switch';
import {
  __resetTestSession,
  __setTestSession,
  getRequestSession,
  requireAdmin,
  requireRoles,
} from '../lib/api-helpers';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// ---------------------------------------------------------------------------
// Fixtures — SessionUser-shaped subjects (flags as toSessionUser populates)
// ---------------------------------------------------------------------------

const dual = { id: 'dual', name: 'Dual', email: 'dual@example.com', role: 'instructor' as const, isTeacher: true, isAdmin: true };
const dualStudentPrimary = { id: 'dual-s', name: 'Dual S', email: 'duals@example.com', role: 'student' as const, isTeacher: true, isAdmin: true };
const teacherOnly = { id: 't1', name: 'Teacher', email: 't@example.com', role: 'instructor' as const, isTeacher: true, isAdmin: false };
const adminOnly = { id: 'a1', name: 'Admin', email: 'a@example.com', role: 'admin' as const, isTeacher: false, isAdmin: true };
const studentOnly = { id: 's1', name: 'Student', email: 's@example.com', role: 'student' as const, isTeacher: false, isAdmin: false };
const flagTeacher = { id: 'ft', name: 'Flag Teacher', email: 'ft@example.com', role: 'student' as const, isTeacher: true, isAdmin: false };
const flagAdmin = { id: 'fa', name: 'Flag Admin', email: 'fa@example.com', role: 'student' as const, isTeacher: false, isAdmin: true };

test.afterEach(() => {
  __resetTestSession();
});

// ---------------------------------------------------------------------------
// portalFromPathname
// ---------------------------------------------------------------------------

test('portalFromPathname: portal is derived from the URL prefix', () => {
  assert.equal(portalFromPathname('/admin/dashboard'), 'admin');
  assert.equal(portalFromPathname('/admin/courses/123'), 'admin');
  assert.equal(portalFromPathname('/admin'), 'admin');
  assert.equal(portalFromPathname('/instructor/dashboard'), 'instructor');
  assert.equal(portalFromPathname('/instructor/quizzes'), 'instructor');
  assert.equal(portalFromPathname('/student/dashboard'), 'student');
  assert.equal(portalFromPathname('/courses'), null);
  assert.equal(portalFromPathname('/'), null);
  assert.equal(portalFromPathname(''), null);
  assert.equal(portalFromPathname(null), null);
  // A public path that merely starts with a portal word is not a portal.
  assert.equal(portalFromPathname('/administrator'), null);
  assert.equal(portalFromPathname('/instructors'), null);
});

// ---------------------------------------------------------------------------
// Visibility matrix
// ---------------------------------------------------------------------------

test('switcher: teacher+admin sees BOTH switch options (one per portal)', () => {
  const fromAdmin = getPortalSwitch(dual, '/admin/dashboard');
  assert.ok(fromAdmin);
  assert.equal(fromAdmin.label, 'Switch to Teacher Portal');
  assert.equal(fromAdmin.href, '/instructor/dashboard');
  assert.equal(fromAdmin.target, 'instructor');

  const fromInstructor = getPortalSwitch(dual, '/instructor/dashboard');
  assert.ok(fromInstructor);
  assert.equal(fromInstructor.label, 'Switch to Admin Panel');
  assert.equal(fromInstructor.href, '/admin/dashboard');
  assert.equal(fromInstructor.target, 'admin');
});

test('switcher: teacher+admin with a student primary role still sees both (flags decide, not role)', () => {
  assert.equal(getPortalSwitch(dualStudentPrimary, '/admin/dashboard')?.label, 'Switch to Teacher Portal');
  assert.equal(getPortalSwitch(dualStudentPrimary, '/instructor/courses')?.label, 'Switch to Admin Panel');
});

test('switcher: normal teacher sees NO switch option', () => {
  assert.equal(getPortalSwitch(teacherOnly, '/instructor/dashboard'), null);
  assert.equal(getPortalSwitch(teacherOnly, '/instructor/courses'), null);
  // A flag-only teacher (primary role student, isTeacher) in the
  // instructor portal likewise has no admin capability to switch to.
  assert.equal(getPortalSwitch(flagTeacher, '/instructor/dashboard'), null);
});

test('switcher: normal admin sees NO switch option', () => {
  assert.equal(getPortalSwitch(adminOnly, '/admin/dashboard'), null);
  assert.equal(getPortalSwitch(adminOnly, '/admin/courses'), null);
  // A flag-only admin in the admin portal has no teacher capability.
  assert.equal(getPortalSwitch(flagAdmin, '/admin/dashboard'), null);
});

test('switcher: pure student sees NO switch option anywhere', () => {
  assert.equal(getPortalSwitch(studentOnly, '/student/dashboard'), null);
  assert.equal(getPortalSwitch(studentOnly, '/admin/dashboard'), null);
  assert.equal(getPortalSwitch(studentOnly, '/instructor/dashboard'), null);
  assert.equal(getPortalSwitch(null, '/admin/dashboard'), null);
  assert.equal(getPortalSwitch(undefined, '/instructor/dashboard'), null);
});

test('switcher: legacy primary roles alone confer no switch (no flag, no second portal)', () => {
  // role 'admin' with no explicit flags: admin capability via legacy
  // fallback, but no teacher capability — so no way over.
  assert.equal(getPortalSwitch({ role: 'admin' }, '/admin/dashboard'), null);
  assert.equal(getPortalSwitch({ role: 'instructor' }, '/instructor/dashboard'), null);
});

test('switcher: no switch on public pages, even for a dual-role user', () => {
  assert.equal(getPortalSwitch(dual, '/courses'), null);
  assert.equal(getPortalSwitch(dual, '/'), null);
  assert.equal(getPortalSwitch(dual, null), null);
});

// ---------------------------------------------------------------------------
// Landing behaviour
// ---------------------------------------------------------------------------

test('switcher: landing is always the other portal DASHBOARD (never the same section)', () => {
  // Even deep inside a section, the switch goes to the dashboard —
  // the counterpart section may not exist (e.g. admin has no quizzes
  // page, instructor has no payments page), so staying "in the same
  // section" would 404. The dashboard is the predictable landing.
  assert.equal(getPortalSwitch(dual, '/admin/payments')?.href, '/instructor/dashboard');
  assert.equal(getPortalSwitch(dual, '/instructor/quizzes/abc')?.href, '/admin/dashboard');
});

// ---------------------------------------------------------------------------
// Navbar: primary portal
// ---------------------------------------------------------------------------

test('navbar: primaryPortalDashboard points at the PRIMARY portal', () => {
  assert.equal(primaryPortalDashboard(dual), '/instructor/dashboard');
  assert.equal(primaryPortalDashboard(adminOnly), '/admin/dashboard');
  assert.equal(primaryPortalDashboard(studentOnly), '/student/dashboard');
  // A flag-admin whose primary role is student lands on the student
  // portal from the navbar — flags never change the home portal.
  assert.equal(primaryPortalDashboard(flagAdmin), '/student/dashboard');
  assert.equal(primaryPortalDashboard(null), null);
});

// ---------------------------------------------------------------------------
// Backend enforcement — the manual-navigation redirect tests.
// The layouts redirect to /auth/login when their capability check
// fails; the same check is exercised here through the API guards,
// which share the hasAdminCapability / hasTeacherCapability predicates.
// ---------------------------------------------------------------------------

test('enforcement: a pure teacher who manually navigates to /admin is denied (403)', async () => {
  __setTestSession(teacherOnly);
  const denied = await requireAdmin();
  assert.ok('error' in denied, 'pure teacher must be denied admin access');
  assert.equal(denied.error.status, 403);
  // Same for the flag-only teacher (primary role student + isTeacher).
  __setTestSession(flagTeacher);
  const deniedFlag = await requireAdmin();
  assert.ok('error' in deniedFlag);
  assert.equal(deniedFlag.error.status, 403);
});

test('enforcement: a pure admin who manually navigates to /instructor is denied (403)', async () => {
  __setTestSession(adminOnly);
  const denied = await requireRoles(['instructor']);
  assert.ok('error' in denied, 'pure admin must be denied instructor access');
  assert.equal(denied.error.status, 403);
  __setTestSession(flagAdmin);
  const deniedFlag = await requireRoles(['instructor']);
  assert.ok('error' in deniedFlag);
  assert.equal(deniedFlag.error.status, 403);
});

test('enforcement: teacher+admin passes BOTH portal gates', async () => {
  __setTestSession(dual);
  assert.ok(!('error' in await requireAdmin()));
  assert.ok(!('error' in await requireRoles(['instructor'])));
  assert.ok(!('error' in await requireRoles(['admin', 'instructor'])));
});

test('enforcement: no session at all is denied everywhere (401)', async () => {
  __setTestSession(null);
  assert.equal((await requireAdmin() as { error: { status: number } }).error.status, 401);
  assert.equal((await requireRoles(['instructor']) as { error: { status: number } }).error.status, 401);
});

test('enforcement: both portal layouts still contain their server-side capability guard + redirect', () => {
  const adminLayout = read('app/admin/layout.tsx');
  assert.match(adminLayout, /hasAdminCapability\(session\)/);
  assert.match(adminLayout, /redirect\('\/auth\/login'\)/);
  // The guard runs before PortalLayout renders — a denied user never
  // reaches the switcher UI.
  assert.ok(adminLayout.indexOf('hasAdminCapability(session)') < adminLayout.indexOf('<PortalLayout'));

  const instructorLayout = read('app/instructor/layout.tsx');
  assert.match(instructorLayout, /hasTeacherCapability\(session\)/);
  assert.match(instructorLayout, /redirect\('\/auth\/login'\)/);
  assert.ok(instructorLayout.indexOf('hasTeacherCapability(session)') < instructorLayout.indexOf('<PortalLayout'));
});

// ---------------------------------------------------------------------------
// Session survival — switching never logs the user out
// ---------------------------------------------------------------------------

test('session survives switching: the switch is plain navigation, session untouched', async () => {
  __setTestSession(dual);
  const before = await getRequestSession();
  assert.ok(before);
  assert.equal(before.id, 'dual');
  assert.equal(before.isAdmin, true);
  assert.equal(before.isTeacher, true);

  // "Switching": resolve the target and follow it. No logout call, no
  // session write, no token exchange — just a dashboard href.
  const target = getPortalSwitch(before, '/admin/dashboard');
  assert.ok(target);
  assert.match(target.href, /^\/instructor\/dashboard$/);
  assert.doesNotMatch(target.href, /\/api\//);

  const after = await getRequestSession();
  assert.deepEqual(after, before);
});

// ---------------------------------------------------------------------------
// Wiring — source inspection (PortalLayout cannot render in node)
// ---------------------------------------------------------------------------

test('wiring: PortalLayout renders the switch as a <Link> from getPortalSwitch, in the topbar', () => {
  const src = read('components/layout/PortalLayout.tsx');
  assert.match(src, /getPortalSwitch\(user, pathname\)/);
  assert.match(src, /href=\{switchTarget\.href\}/);
  assert.match(src, /aria-label=\{switchTarget\.label\}/);
  // The switch link sits in the topbar <header>, next to the bell —
  // not buried in the sidebar, so it is visible on every portal page.
  const headerAt = src.indexOf('<header');
  const switchAt = src.indexOf('switchTarget.href');
  assert.ok(headerAt >= 0 && switchAt > headerAt, 'switch link must be inside the topbar header');
  // Labels are the exact strings the task requires.
  assert.match(src, /switchTarget\.label/);
  const helper = read('lib/portal-switch.ts');
  assert.ok(helper.includes('Switch to Teacher Portal'));
  assert.ok(helper.includes('Switch to Admin Panel'));
});

test('wiring: bell and avatar follow the CURRENT portal, not the primary role', () => {
  const src = read('components/layout/PortalLayout.tsx');
  assert.match(src, /portalFromPathname\(pathname\)/);
  assert.match(src, /\/\$\{portalSlug\}\/notifications/);
  assert.match(src, /\/\$\{portalSlug\}\/profile/);
  assert.doesNotMatch(src, /\/\$\{user\.role\}\/notifications/);
  assert.doesNotMatch(src, /\/\$\{user\.role\}\/profile/);
});

test('wiring: Navbar points at the primary portal via the shared helper', () => {
  const src = read('components/layout/Navbar.tsx');
  assert.match(src, /primaryPortalDashboard\(session\)/);
  assert.doesNotMatch(src, /`\/\$\{session\.role\}\/dashboard`/);
});

test('wiring: no client-side role trust — no cookie read, no client-sent role decides access', () => {
  const layout = read('components/layout/PortalLayout.tsx');
  assert.doesNotMatch(layout, /document\.cookie/);
  assert.doesNotMatch(layout, /localStorage|sessionStorage/);
  const helper = read('lib/portal-switch.ts');
  assert.doesNotMatch(helper, /document\.cookie/);
  assert.doesNotMatch(helper, /localStorage|sessionStorage/);
  // The only fetch in PortalLayout is the pre-existing logout in the
  // sidebar — the switch path performs no request of its own.
  const fetches = layout.match(/fetch\(/g) ?? [];
  assert.equal(fetches.length, 1, 'PortalLayout must contain only the pre-existing logout fetch');
  assert.match(layout, /action: 'logout'/);
});

test('wiring: certificate system untouched by the switcher', () => {
  assert.doesNotMatch(read('components/layout/PortalLayout.tsx'), /certificate/i);
  assert.doesNotMatch(read('lib/portal-switch.ts'), /certificate/i);
  assert.doesNotMatch(read('components/layout/Navbar.tsx'), /certificate/i);
});
