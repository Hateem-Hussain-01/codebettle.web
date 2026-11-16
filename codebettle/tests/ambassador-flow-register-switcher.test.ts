/**
 * Ambassador flow — register-first apply, dashboard switcher,
 * login-form link (Eman, 16 Nov 2026).
 *
 * (1) /become-ambassador requires an account: logged-out visitors
 *     go to register, the API 401s without a session, 403s when the
 *     submitted email is not the session user's, and 409s on a
 *     duplicate while one is pending/approved (re-applying after a
 *     rejection is allowed). The form prefills the account email and
 *     locks the field; an existing application shows its status.
 * (2) Dashboard switcher: the instructor layout shows the Ambassador
 *     item only for approved ambassadors, the ambassador page admits
 *     teacher-capable sessions, and the dashboard has a switcher
 *     (Student Portal always, Instructor Portal only with teacher
 *     capability).
 * (3) Login-form link: "Login as Ambassador" at the bottom of the
 *     login form — everywhere EXCEPT /ambassador/login itself (and
 *     the secret admin sign-in).
 * (4) Email link-up: an Ambassador row approved before the user
 *     registered (userId null — Areeba Imran) gets linked on
 *     register/login, and ensureAmbassadorForApplication + the
 *     backfill heal the early-return path.
 *
 * Route tests call the handler directly with a real session token
 * (withRequestCookies, same pattern as
 * tests/security-phase3-auth-ratelimit.test.ts); layout/page wiring
 * is asserted by source inspection, following the Phase 6 design-test
 * pattern (tests/phase6-design.test.ts).
 */
// FIRST import: sets globalThis.AsyncLocalStorage before any Next
// module loads (see tests/next-request-store.ts) — required for the
// route tests, which call getSession() via next/headers.
import { withRequestCookies } from './next-request-store';
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession } from '../lib/api-helpers';
import { __clearRateLimits } from '../lib/rate-limit';
import { createFakeDb, type FakeDb } from './fake-db';
import { SESSION_COOKIE } from '../lib/auth';
import { login, registerUser } from '../lib/services/auth-service';
import { createSessionRecord } from '../lib/db/sessions';
import { createUser } from '../lib/db/users';
import {
  backfillAmbassadorsForApprovedApplications,
  createAmbassador,
  ensureAmbassadorForApplication,
  getAmbassadorByUserId,
  linkAmbassadorToUserByEmail,
} from '../lib/db/ambassadors';
import {
  createAmbassadorApplication,
  getLatestAmbassadorApplicationByEmail,
} from '../lib/db/ambassador-applications';
import { POST as applyPost } from '../app/api/become-ambassador/route';

const D = (s: string) => new Date(s);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

let fake: FakeDb;
let ipCounter = 100;

function reset() {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  __clearRateLimits();
  ipCounter = 100;
}

test.beforeEach(() => reset());
test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function jsonReq(url: string, body: unknown, ip: string): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
  });
}

const validBody = (email: string) => ({
  fullName: 'Areeba Imran',
  whatsapp: '03317229888',
  email,
  university: 'University Of Agriculture Faisalabad',
  departmentSemester: 'BS Information Technology, 5th semester',
  leadershipPosition: 'None / General Student',
  promotionPlan: 'Share in class groups and societies.',
  priorAmbassadorExperience: 'No',
});

/** A signed-in student; returns the session cookie value. */
async function signedInStudent(email: string): Promise<string> {
  const created = await registerUser({ name: 'Student', email, password: 'Password123' });
  assert.ok('user' in created, `expected user, got ${JSON.stringify(created)}`);
  const { token } = await createSessionRecord(created.user.id);
  return `${SESSION_COOKIE}=${token}`;
}

/** POST /api/become-ambassador with the given session cookie ('' = logged out). */
async function applyAs(cookie: string, body: unknown, ip = nextIp()) {
  return withRequestCookies(cookie, () =>
    applyPost(jsonReq('http://localhost:3000/api/become-ambassador', body, ip)),
  );
}

// ---------------------------------------------------------------------------
// (1) Application API: register-first
// ---------------------------------------------------------------------------

test('apply API: 401 when logged out', async () => {
  const res = await applyAs('', validBody('student@example.com'));
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.match(data.error, /sign in/i);
});

test('apply API: 403 when the email is not the session user\u2019s email', async () => {
  const cookie = await signedInStudent('student@example.com');
  const res = await applyAs(cookie, validBody('someone-else@example.com'));
  assert.equal(res.status, 403);
  // Nothing was filed for either email.
  assert.equal((await getLatestAmbassadorApplicationByEmail('someone-else@example.com')), null);
  assert.equal((await getLatestAmbassadorApplicationByEmail('student@example.com')), null);
});

test('apply API: 201 for the session user\u2019s own email (stored lowercase)', async () => {
  const cookie = await signedInStudent('student@example.com');
  const res = await applyAs(cookie, validBody('STUDENT@Example.com'));
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.application.email, 'student@example.com');
  assert.equal(data.application.status, 'pending');
});

test('apply API: 409 on a duplicate while one is pending, and while one is approved', async () => {
  const cookie = await signedInStudent('student@example.com');
  const first = await applyAs(cookie, validBody('student@example.com'));
  assert.equal(first.status, 201);
  const dupPending = await applyAs(cookie, validBody('student@example.com'));
  assert.equal(dupPending.status, 409);
  assert.match((await dupPending.json()).error, /under review/i);

  // Approve the first application directly, then a second is still refused.
  const application = await getLatestAmbassadorApplicationByEmail('student@example.com');
  assert.ok(application);
  (fake.tables['AmbassadorApplication']?.get(application.id) as Record<string, unknown>).status = 'approved';
  const dupApproved = await applyAs(cookie, validBody('student@example.com'));
  assert.equal(dupApproved.status, 409);
  assert.match((await dupApproved.json()).error, /already approved/i);
});

test('apply API: a rejected application may be filed again', async () => {
  const cookie = await signedInStudent('student@example.com');
  const first = await applyAs(cookie, validBody('student@example.com'));
  assert.equal(first.status, 201);
  const application = await getLatestAmbassadorApplicationByEmail('student@example.com');
  assert.ok(application);
  (fake.tables['AmbassadorApplication']?.get(application.id) as Record<string, unknown>).status = 'rejected';
  const again = await applyAs(cookie, validBody('student@example.com'));
  assert.equal(again.status, 201);
  assert.equal((await again.json()).application.status, 'pending');
});

test('apply API: the 8 exact fields are still validated (missing field -> 400)', async () => {
  const cookie = await signedInStudent('student@example.com');
  const { university: _omitted, ...partial } = validBody('student@example.com');
  const res = await applyAs(cookie, partial);
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// (4) Email link-up: a null-userId ambassador row gets linked
// ---------------------------------------------------------------------------

test('link-up: linkAmbassadorToUserByEmail links a null-userId row, never steals another\u2019s', async () => {
  const user = await createUser({
    name: 'Areeba Imran',
    email: 'areeba@example.com',
    passwordHash: 'x',
    role: 'student',
  });
  const row = await createAmbassador({ email: 'areeba@example.com' });
  assert.equal(row.userId, undefined);

  const linked = await linkAmbassadorToUserByEmail('areeba@example.com', user.id);
  assert.ok(linked);
  assert.equal(linked.userId, user.id);
  assert.equal((await getAmbassadorByUserId(user.id))?.id, row.id);

  // A row already linked to someone else is never stolen.
  const other = await createUser({
    name: 'Other',
    email: 'other@example.com',
    passwordHash: 'x',
    role: 'student',
  });
  assert.equal(await linkAmbassadorToUserByEmail('areeba@example.com', other.id), null);
  assert.equal((await getAmbassadorByUserId(user.id))?.id, row.id);

  // No row for the email: null, no throw.
  assert.equal(await linkAmbassadorToUserByEmail('nobody@example.com', other.id), null);
});

test('link-up: registering with the ambassador\u2019s email opens their dashboard (Areeba scenario)', async () => {
  // Approved before any account existed: row with a code, userId null.
  const row = await createAmbassador({ email: 'areebaimran2705@gmail.com' });
  assert.equal(row.userId, undefined);

  const created = await registerUser({
    name: 'Areeba Imran',
    email: 'areebaimran2705@gmail.com',
    password: 'Password123',
  });
  assert.ok('user' in created);
  // The new account is linked — the dashboard resolves by user id.
  const resolved = await getAmbassadorByUserId(created.user.id);
  assert.ok(resolved);
  assert.equal(resolved.id, row.id);
  assert.equal(resolved.referralCode, row.referralCode);
});

test('link-up: signing in with the ambassador\u2019s email links the row too', async () => {
  const created = await registerUser({
    name: 'Areeba Imran',
    email: 'areeba2@example.com',
    password: 'Password123',
  });
  assert.ok('user' in created);
  // The row exists and is linked; break the link by hand (as if the
  // row was created before the account) — signing in must heal it.
  const row = await createAmbassador({ email: 'areeba2@example.com', userId: created.user.id });
  assert.equal(row.userId, created.user.id);
  (fake.tables['Ambassador']?.get(row.id) as Record<string, unknown>).userId = null;
  assert.equal(await getAmbassadorByUserId(created.user.id), null);

  const session = await login('areeba2@example.com', 'Password123');
  assert.ok(session);
  assert.equal((await getAmbassadorByUserId(created.user.id))?.id, row.id);
});

test('link-up: ensureAmbassadorForApplication heals the early-return path (row exists, userId null)', async () => {
  const application = await createAmbassadorApplication({
    fullName: 'Areeba Imran',
    whatsapp: '03317229888',
    email: 'areeba3@example.com',
    university: 'UAF',
    departmentSemester: 'BS 5th',
    leadershipPosition: 'None / General Student',
    promotionPlan: 'Share in groups.',
    priorAmbassadorExperience: 'No',
  });
  // Approved before the account existed: row, no user to link yet.
  const first = await ensureAmbassadorForApplication(application);
  assert.equal(first.userId, undefined);

  // The user registers later (via createUser here, so the auth
  // service's own link-up does not run — this isolates ensure()).
  const user = await createUser({
    name: 'Areeba Imran',
    email: 'areeba3@example.com',
    passwordHash: 'x',
    role: 'student',
  });
  const healed = await ensureAmbassadorForApplication(application);
  assert.equal(healed.id, first.id);
  assert.equal(healed.userId, user.id);
  assert.equal((await getAmbassadorByUserId(user.id))?.id, first.id);
});

test('link-up: the admin backfill heals an existing unlinked row', async () => {
  const application = await createAmbassadorApplication({
    fullName: 'Old One',
    whatsapp: '03007654321',
    email: 'old@example.com',
    university: 'UAF',
    departmentSemester: 'BS 3rd',
    leadershipPosition: 'Class Representative (CR)',
    promotionPlan: 'Posters.',
    priorAmbassadorExperience: 'Yes',
  });
  (fake.tables['AmbassadorApplication']?.get(application.id) as Record<string, unknown>).status = 'approved';
  const row = await ensureAmbassadorForApplication(application);
  assert.equal(row.userId, undefined);

  const user = await createUser({
    name: 'Old One',
    email: 'old@example.com',
    passwordHash: 'x',
    role: 'student',
  });
  assert.equal(await backfillAmbassadorsForApprovedApplications(), 0, 'healing creates no new row');
  assert.equal((await getAmbassadorByUserId(user.id))?.id, row.id);
});

test('getLatestAmbassadorApplicationByEmail returns the newest application for the email', async () => {
  fake.seed('AmbassadorApplication', [
    {
      id: 'app-old', fullName: 'A', whatsapp: '1', email: 'dup@example.com', university: 'UAF',
      departmentSemester: 'BS 1st', leadershipPosition: 'None / General Student',
      promotionPlan: 'p', priorAmbassadorExperience: 'No', status: 'rejected',
      createdAt: D('2026-11-01'), updatedAt: D('2026-11-01'),
    },
    {
      id: 'app-new', fullName: 'A', whatsapp: '1', email: 'dup@example.com', university: 'UAF',
      departmentSemester: 'BS 1st', leadershipPosition: 'None / General Student',
      promotionPlan: 'p', priorAmbassadorExperience: 'No', status: 'pending',
      createdAt: D('2026-11-15'), updatedAt: D('2026-11-15'),
    },
  ]);
  const latest = await getLatestAmbassadorApplicationByEmail('dup@example.com');
  assert.equal(latest?.id, 'app-new');
  assert.equal(latest?.status, 'pending');
  assert.equal(await getLatestAmbassadorApplicationByEmail('nobody@example.com'), null);
});

// ---------------------------------------------------------------------------
// (2) Dashboard switcher — layout + page + client wiring (source inspection)
// ---------------------------------------------------------------------------

test('switcher: instructor layout shows the Ambassador item only for approved ambassadors', () => {
  const src = read('app/instructor/layout.tsx');
  assert.ok(src.includes("import { getAmbassadorByUserId } from '@/lib/db/ambassadors'"));
  assert.ok(src.includes("href: '/student/ambassador', label: 'Ambassador'"));
  assert.ok(src.includes("ambassador.status === 'active'"), 'gated on active status');
  assert.ok(src.includes('showAmbassadorNav'), 'fail-safe flag, like the student layout');
});

test('switcher: student layout exempts ONLY the ambassador page for teacher-capable users', () => {
  const src = read('app/student/layout.tsx');
  assert.ok(src.includes("get('x-pathname')"), 'path comes from the proxy header');
  assert.ok(src.includes("pathname === '/student/ambassador'"));
  assert.ok(src.includes('hasTeacherCapability(session)'));
  assert.ok(src.includes("session.role !== 'student'"), 'the primary-role rule stays for every other page');
});

test('switcher: ambassador page admits teacher-capable sessions and passes the switcher prop', () => {
  const src = read('app/student/ambassador/page.tsx');
  assert.ok(src.includes("session.role !== 'student' && !hasTeacherCapability(session)"));
  assert.ok(src.includes('showInstructorPortal={hasTeacherCapability(session)}'));
});

test('switcher: dashboard top has Student Portal always, Instructor Portal only with teacher capability', () => {
  const src = read('app/student/ambassador/ambassador-dashboard-client.tsx');
  assert.ok(src.includes('Switch dashboard:'), 'visible switcher at the top');
  assert.ok(src.includes('href="/student/dashboard"'), 'Student Portal link');
  assert.ok(src.includes('href="/instructor/dashboard"'), 'Instructor Portal link');
  assert.ok(src.includes('{showInstructorPortal && ('), 'Instructor link is conditional');
  assert.ok(src.includes('aria-current="page"'), 'current dashboard is marked, not linked');
  assert.ok(src.includes('showInstructorPortal: boolean'), 'prop is typed on the client');
});

// ---------------------------------------------------------------------------
// (1) Register-first page + form — wiring (source inspection)
// ---------------------------------------------------------------------------

test('register-first: page redirects logged-out visitors to register and shows an existing application\u2019s status', () => {
  const src = read('app/become-ambassador/page.tsx');
  assert.ok(src.includes("redirect('/auth/register?redirect=/become-ambassador')"));
  assert.ok(src.includes('getLatestAmbassadorApplicationByEmail(session.email)'));
  assert.ok(src.includes('email={session.email}'));
  assert.ok(src.includes('existingApplication={existingApplication}'));
});

test('register-first: form locks the email to the account and replaces itself with the application status', () => {
  const src = read('app/become-ambassador/become-ambassador-client.tsx');
  assert.ok(src.includes('Your account email'), 'locked-email note');
  assert.ok(src.includes('Application under review'), 'pending status shown, no second form');
  assert.ok(src.includes('You are an ambassador!'), 'approved status shown');
  assert.ok(src.includes('Application not approved'), 'rejected status shown');
  assert.ok(src.includes('Submit a new application'), 'rejected applicants may re-apply');
  assert.ok(src.includes('Open your Ambassador Dashboard'), 'approved applicants get the dashboard link');
});

test('register-first: route guards are in place (401 / 403 / 409)', () => {
  const src = read('app/api/become-ambassador/route.ts');
  assert.ok(src.includes("import { getSession } from '@/lib/auth'"));
  assert.ok(src.includes('status: 401'));
  assert.ok(src.includes('status: 403'));
  assert.ok(src.includes('status: 409'));
  assert.ok(src.includes('getLatestAmbassadorApplicationByEmail(email)'));
  assert.ok(src.includes("existing.status === 'pending' || existing.status === 'approved'"));
});

// ---------------------------------------------------------------------------
// (3) Login-form ambassador link — wiring (source inspection)
// ---------------------------------------------------------------------------

test('login link: LoginForm shows "Login as Ambassador" at the bottom, gated by prop and adminOnly', () => {
  const src = read('components/auth/LoginForm.tsx');
  assert.ok(src.includes('href="/ambassador/login?redirect=/student/ambassador"'));
  assert.ok(src.includes('Login as Ambassador'));
  assert.ok(src.includes('showAmbassadorLink?: boolean'), 'conditional prop');
  assert.ok(src.includes('showAmbassadorLink = true'), 'shown by default');
  assert.ok(src.includes('showAmbassadorLink && !adminOnly'), 'hidden for the admin sign-in too');
  // It is the LAST link block of the form (after the Sign up line).
  // (Match on the href, not the label — the label also appears in
  // the header comment above the component.)
  const linkAt = src.indexOf('href="/ambassador/login?redirect=/student/ambassador"');
  const signUpAt = src.indexOf('Don&apos;t have an account?');
  assert.ok(linkAt > signUpAt, 'ambassador link comes after the Sign up line, at the end of the form');
});

test('login link: hidden on /ambassador/login itself, shown by default on /auth/login and /auth/register', () => {
  assert.ok(read('app/ambassador/login/page.tsx').includes('<LoginForm showAmbassadorLink={false} />'));
  assert.ok(read('app/auth/login/page.tsx').includes('<LoginForm />'));
  assert.ok(read('app/auth/register/page.tsx').includes('<LoginForm />'));
  assert.ok(!read('app/auth/login/page.tsx').includes('showAmbassadorLink={false}'));
});

test('login link: RegisterForm honours ?redirect= so the register-first flow returns to the page', () => {
  const src = read('components/auth/RegisterForm.tsx');
  assert.ok(src.includes("getSafeRedirect(searchParams.get('redirect'), '/student/dashboard')"));
  assert.ok(src.includes('router.push(redirectTarget)'));
});
