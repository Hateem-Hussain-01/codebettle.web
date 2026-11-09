import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { getCertificateByToken } from '../lib/db/certificates';
import { GET } from '../app/api/certificates/verify/route';

/**
 * Phase 7 — public certificate verification (CB-13 fix).
 * Certificates carried a verificationToken that nothing in the app
 * ever used — there was no way to check one. Now the token resolves
 * to the four public facts only: student name, course title,
 * certificate number, issued date. No ids, no email, no token echo.
 */

const D = (s: string) => new Date(s);
const TOKEN = 'a'.repeat(32);

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: 'Long',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Certificate', [
    { id: 'cert-1', studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1', certificateNumber: 'CB-2024-001', verificationToken: TOKEN, issuedAt: D('2024-06-01') },
  ]);
});

test('getCertificateByToken resolves the token, null for an unknown one', async () => {
  const found = await getCertificateByToken(TOKEN);
  assert.equal(found?.certificateNumber, 'CB-2024-001');
  assert.equal(await getCertificateByToken('b'.repeat(32)), null);
});

test('GET /api/certificates/verify returns only the four public facts', async () => {
  const res = await GET(new NextRequest(`http://localhost/api/certificates/verify?token=${TOKEN}`));
  assert.equal(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assert.equal(body.valid, true);
  assert.equal(body.studentName, 'Ali');
  assert.equal(body.courseTitle, 'Web 101');
  assert.equal(body.certificateNumber, 'CB-2024-001');
  assert.equal(body.issuedAt, '2024-06-01');
  // Nothing identifying beyond those four facts may leak.
  assert.equal('studentId' in body, false);
  assert.equal('courseId' in body, false);
  assert.equal('email' in body, false);
  assert.equal('verificationToken' in body, false);
  assert.equal('id' in body, false);
  assert.equal(JSON.stringify(body).includes(TOKEN), false);
});

test('GET /api/certificates/verify: unknown token is 404, missing token is 400', async () => {
  const unknown = await GET(new NextRequest(`http://localhost/api/certificates/verify?token=${'c'.repeat(32)}`));
  assert.equal(unknown.status, 404);
  const missing = await GET(new NextRequest('http://localhost/api/certificates/verify'));
  assert.equal(missing.status, 400);
});
