import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as authPost } from '../app/api/auth/route';
import { matchesLoginPortal } from '../lib/rbac';
import { hashPassword } from '../lib/security';
import { createUser } from '../lib/db/users';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb } from './fake-db';

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PASSWORD = 'TestPass123';

const STUDENT_MSG =
  'This account is registered as a Student. Please switch to the Student tab to sign in.';
const INSTRUCTOR_MSG =
  'This account is registered as an Instructor. Please switch to the Instructor tab to sign in.';

test.beforeEach(() => {
  __setDbClient(createFakeDb().asClient());
});

test.afterEach(() => {
  __resetDbClient();
});

type Role = 'student' | 'instructor' | 'admin';

async function makeUser(
  tag: string,
  role: Role,
  flags: { isTeacher?: boolean; isAdmin?: boolean } = {},
): Promise<string> {
  const email = `guard-${tag}-${suffix()}@example.com`;
  await createUser({
    name: `Guard ${tag}`,
    email,
    passwordHash: await hashPassword(PASSWORD),
    role,
    isTeacher: flags.isTeacher ?? false,
    isAdmin: flags.isAdmin ?? false,
  });
  return email;
}

function loginReq(
  email: string,
  password: string,
  requestedRole?: 'student' | 'instructor',
): NextRequest {
  const body: Record<string, string> = { action: 'login', email, password };
  if (requestedRole !== undefined) body.requestedRole = requestedRole;
  return new NextRequest('http://localhost/api/auth', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function attemptLogin(
  email: string,
  password: string,
  requestedRole?: 'student' | 'instructor',
): Promise<{ status: number; body: Record<string, unknown>; setCookie: string | null }> {
  const res = await authPost(loginReq(email, password, requestedRole));
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body, setCookie: res.headers.get('set-cookie') };
}

test('student email + Instructor tab is rejected with the Student instruction and no session', async () => {
  const email = await makeUser('student', 'student');
  const res = await attemptLogin(email, PASSWORD, 'instructor');
  assert.equal(res.status, 403);
  assert.equal(res.body.error, STUDENT_MSG);
  assert.equal(res.setCookie, null, 'no session cookie must be set on a rejected login');
});

test('instructor email + Student tab is rejected with the Instructor instruction and no session', async () => {
  const email = await makeUser('instructor', 'instructor', { isTeacher: true });
  const res = await attemptLogin(email, PASSWORD, 'student');
  assert.equal(res.status, 403);
  assert.equal(res.body.error, INSTRUCTOR_MSG);
  assert.equal(res.setCookie, null, 'no session cookie must be set on a rejected login');
});

test('a user who is BOTH student and teacher can sign in via either tab', async () => {
  const email = await makeUser('both', 'student', { isTeacher: true });
  const viaStudent = await attemptLogin(email, PASSWORD, 'student');
  assert.equal(viaStudent.status, 200);
  assert.ok(viaStudent.setCookie?.includes('cb_session'), 'session cookie must be set');
  const viaInstructor = await attemptLogin(email, PASSWORD, 'instructor');
  assert.equal(viaInstructor.status, 200);
  assert.ok(viaInstructor.setCookie?.includes('cb_session'), 'session cookie must be set');
});

test('pure student via Student tab and pure instructor via Instructor tab still sign in', async () => {
  const student = await makeUser('pure-student', 'student');
  const s = await attemptLogin(student, PASSWORD, 'student');
  assert.equal(s.status, 200);
  assert.equal((s.body.user as { role: string }).role, 'student');

  const instructor = await makeUser('pure-instructor', 'instructor', { isTeacher: true });
  const i = await attemptLogin(instructor, PASSWORD, 'instructor');
  assert.equal(i.status, 200);
  assert.equal((i.body.user as { role: string }).role, 'instructor');
});

test('admin signs in via EITHER tab (there is no Admin tab — this is how admins log in today)', async () => {
  const email = await makeUser('admin', 'admin', { isAdmin: true });
  const viaStudent = await attemptLogin(email, PASSWORD, 'student');
  assert.equal(viaStudent.status, 200);
  assert.equal((viaStudent.body.user as { role: string }).role, 'admin');
  const viaInstructor = await attemptLogin(email, PASSWORD, 'instructor');
  assert.equal(viaInstructor.status, 200);
  assert.equal((viaInstructor.body.user as { role: string }).role, 'admin');
});

test('wrong password with the wrong tab still returns the generic error, never the role message', async () => {
  const email = await makeUser('wrongpw', 'student');
  const res = await attemptLogin(email, 'WrongPass123', 'instructor');
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid email or password');
});

test('unknown email with the Instructor tab still returns the generic error (no enumeration)', async () => {
  const res = await attemptLogin(`nobody-${suffix()}@example.com`, PASSWORD, 'instructor');
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid email or password');
});

test('requestedRole omitted is treated as the Student tab (a crafted request cannot bypass the guard)', async () => {
  const student = await makeUser('omitted-student', 'student');
  const s = await attemptLogin(student, PASSWORD);
  assert.equal(s.status, 200);

  const instructor = await makeUser('omitted-instructor', 'instructor', { isTeacher: true });
  const i = await attemptLogin(instructor, PASSWORD);
  assert.equal(i.status, 403);
  assert.equal(i.body.error, INSTRUCTOR_MSG);
});

test('legacy rows (role without the flag) still work via the transitional fallback', async () => {
  // Instructor by primary role only — the Phase 2 backfill fallback.
  const legacyInstructor = await makeUser('legacy-instructor', 'instructor');
  const i = await attemptLogin(legacyInstructor, PASSWORD, 'instructor');
  assert.equal(i.status, 200);

  // Admin by primary role only.
  const legacyAdmin = await makeUser('legacy-admin', 'admin');
  const a = await attemptLogin(legacyAdmin, PASSWORD, 'student');
  assert.equal(a.status, 200);
});

test('matchesLoginPortal unit matrix', () => {
  const student = { role: 'student' as const };
  const instructor = { role: 'instructor' as const, isTeacher: true };
  const both = { role: 'student' as const, isTeacher: true };
  const admin = { role: 'admin' as const, isAdmin: true };
  const legacyInstructor = { role: 'instructor' as const };
  const legacyAdmin = { role: 'admin' as const };

  assert.equal(matchesLoginPortal(student, 'student'), true);
  assert.equal(matchesLoginPortal(student, 'instructor'), false);
  assert.equal(matchesLoginPortal(instructor, 'student'), false);
  assert.equal(matchesLoginPortal(instructor, 'instructor'), true);
  assert.equal(matchesLoginPortal(both, 'student'), true);
  assert.equal(matchesLoginPortal(both, 'instructor'), true);
  assert.equal(matchesLoginPortal(admin, 'student'), true);
  assert.equal(matchesLoginPortal(admin, 'instructor'), true);
  assert.equal(matchesLoginPortal(legacyInstructor, 'instructor'), true);
  assert.equal(matchesLoginPortal(legacyAdmin, 'student'), true);
  assert.equal(matchesLoginPortal(null, 'student'), false);
  assert.equal(matchesLoginPortal(undefined, 'instructor'), false);
});
