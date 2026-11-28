// Temporary certificate form (Eman, 28 Nov 2026): Batch 08 students
// download their certificates with the email they enrolled with — no
// login, no password — from the one public link /certificates.
//
// These tests pin the three pieces: the lookup route answers only for
// a matching email (same generic not_found whether the email is
// unknown or has no certificate), the download route serves a
// certificate to its verification token with no session (and the same
// 404 for a wrong token, STU-02), and the page is a public email form
// that never asks for a login. The PDF render itself is unchanged and
// covered by the existing student download path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { POST as lookupPost } from '../app/api/certificates/lookup/route';
import { GET as downloadGet } from '../app/api/certificates/[id]/download/route';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  __resetTestSession();
});

test.afterEach(() => {
  __resetDbClient();
});

function seedStudent() {
  fake.seed('User', [
    {
      id: 'student-1',
      name: 'Test Student',
      email: 'student@example.com',
      passwordHash: 'hash',
      role: 'student',
      status: 'active',
      joinedAt: new Date('2026-01-01'),
    },
  ]);
  fake.seed('Course', [
    { id: 'course-3', slug: 'python-machine-learning', title: 'Python Crash Course', thumbnail: null },
  ]);
  fake.seed('Certificate', [
    {
      id: 'cert-1',
      studentId: 'student-1',
      courseId: 'course-3',
      enrollmentId: 'enr-1',
      certificateNumber: 'CBAIB1002',
      verificationToken: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      batch: 'BATCH-8',
      issuedAt: new Date('2026-11-28'),
      revokedAt: null,
    },
  ]);
}

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '203.0.113.1' },
  });
}

test('lookup: matching email returns the student certificates with their tokens', async () => {
  seedStudent();
  const res = await lookupPost(jsonReq('http://localhost/api/certificates/lookup', { email: 'student@example.com' }));
  assert.equal(res.status, 200);
  const data = (await res.json()) as {
    status: string;
    studentName: string;
    certificates: { certificateNumber: string; courseTitle: string; batch: string; verificationToken: string }[];
  };
  assert.equal(data.status, 'found');
  assert.equal(data.studentName, 'Test Student');
  assert.equal(data.certificates.length, 1);
  assert.equal(data.certificates[0].certificateNumber, 'CBAIB1002');
  assert.equal(data.certificates[0].courseTitle, 'Python Crash Course');
  assert.equal(data.certificates[0].batch, 'BATCH-8');
  assert.equal(data.certificates[0].verificationToken, 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');
});

test('lookup: unknown email and known email without certificates answer the same generic not_found', async () => {
  seedStudent();
  const unknown = await lookupPost(jsonReq('http://localhost/api/certificates/lookup', { email: 'nobody@example.com' }));
  assert.equal(unknown.status, 200);
  assert.deepEqual(await unknown.json(), { status: 'not_found' });

  fake.seed('User', [
    {
      id: 'student-2',
      name: 'No Cert',
      email: 'nocert@example.com',
      passwordHash: 'hash',
      role: 'student',
      status: 'active',
      joinedAt: new Date('2026-01-01'),
    },
  ]);
  const noCert = await lookupPost(jsonReq('http://localhost/api/certificates/lookup', { email: 'nocert@example.com' }));
  assert.equal(noCert.status, 200);
  assert.deepEqual(await noCert.json(), { status: 'not_found' });
});

test('lookup: invalid email is a 400, and the email is matched case-insensitively', async () => {
  seedStudent();
  const bad = await lookupPost(jsonReq('http://localhost/api/certificates/lookup', { email: 'not-an-email' }));
  assert.equal(bad.status, 400);

  const upper = await lookupPost(jsonReq('http://localhost/api/certificates/lookup', { email: 'STUDENT@Example.COM' }));
  assert.equal(upper.status, 200);
  assert.equal(((await upper.json()) as { status: string }).status, 'found');
});

test('download: no session and no token is a 401; a wrong token is the same 404 as a missing certificate', async () => {
  seedStudent();
  // Force "no session" through the test seam — the real getSession()
  // reads cookies(), which throws outside a Next request scope.
  __setTestSession(null);
  const noToken = await downloadGet(
    new NextRequest('http://localhost/api/certificates/cert-1/download'),
    { params: Promise.resolve({ id: 'cert-1' }) },
  );
  assert.equal(noToken.status, 401);

  const wrongToken = await downloadGet(
    new NextRequest('http://localhost/api/certificates/cert-1/download?token=00000000000000000000000000000000'),
    { params: Promise.resolve({ id: 'cert-1' }) },
  );
  assert.equal(wrongToken.status, 404);
});

test('lookup route never touches the auth-only getUserByEmail (hash) — it uses the safe lookup', () => {
  const lookupSrc = read('app/api/certificates/lookup/route.ts');
  assert.ok(lookupSrc.includes('getSafeUserByEmail'), 'the public lookup must use the hash-free lookup');
  assert.ok(!lookupSrc.includes('getUserByEmail('), 'getUserByEmail returns the hash and is auth-only');
  assert.ok(lookupSrc.includes('cert-lookup:'), 'lookups must be rate-limited per IP + email');
  const usersSrc = read('lib/db/users.ts');
  assert.ok(usersSrc.includes('export async function getSafeUserByEmail'), 'the safe lookup must exist');
});

test('download route serves a certificate to its verification token, and the page is a public email form', () => {
  const downloadSrc = read('app/api/certificates/[id]/download/route.ts');
  assert.ok(downloadSrc.includes("searchParams.get('token')"), 'the download must accept ?token=');
  assert.ok(downloadSrc.includes('token !== certificate.verificationToken'), 'a wrong token must fail the same way as no access');
  const pageSrc = read('app/certificates/page.tsx');
  assert.ok(pageSrc.includes('type="email"'), 'the form must ask for the email');
  assert.ok(pageSrc.includes('/api/certificates/lookup'), 'the form must post to the lookup route');
  assert.ok(pageSrc.includes('/api/certificates/${cert.id}/download?token='), 'the download must carry the token');
  assert.ok(!pageSrc.includes('getRequestSession'), 'the public form must never require a login');
});
