import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import type { SessionUser } from '../lib/services/auth-service';
import { GET } from '../app/api/certificates/[id]/download/route';

/**
 * Phase 2 — on-demand certificate PDF download.
 * Auth: signed-out -> 401, another student -> 403, unknown id -> 404.
 * The happy path renders a real PDF with headless Chromium (the same
 * @sparticuz/chromium the route uses in production) and asserts the
 * download headers + a %PDF body. It takes a few seconds — that is
 * the point: it proves the route renders end to end.
 */

const D = (s: string) => new Date(s);
const TOKEN = 'e'.repeat(32);

const STU1: SessionUser = { id: 'stu-1', name: 'Zohaib Hassan', email: 'zohaib@example.com', role: 'student' };
const STU2: SessionUser = { id: 'stu-2', name: 'Other', email: 'other@example.com', role: 'student' };
const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'stu-1', name: 'Zohaib Hassan', email: 'zohaib@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-2', name: 'Other', email: 'other@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'python', title: 'Python', description: 'Intro', longDescription: 'Long',
      thumbnail: '/t.png', category: 'Programming', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: true, completedAt: D('2024-06-01'), paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
  fake.seed('Certificate', [
    { id: 'cert-1', studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1', certificateNumber: 'CB-2026-001', verificationToken: TOKEN, issuedAt: D('2026-06-01'), batch: 'BATCH-8', revokedAt: null },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

const get = (id: string) =>
  GET(new NextRequest(`http://localhost/api/certificates/${id}/download`), { params: Promise.resolve({ id }) });

test('download: signed-out is 401, another student is 403, unknown id is 404', async () => {
  __setTestSession(null);
  assert.equal((await get('cert-1')).status, 401);
  __setTestSession(STU2);
  assert.equal((await get('cert-1')).status, 403);
  __setTestSession(STU1);
  assert.equal((await get('nope')).status, 404);
});

test('download: the owner gets a real PDF with the certificate filename', async () => {
  __setTestSession(STU1);
  const res = await get('cert-1');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/pdf');
  assert.equal(
    res.headers.get('Content-Disposition'),
    'attachment; filename="CodeBettle-Certificate-CB-2026-001.pdf"',
  );
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 10000, `PDF should carry the embedded template, got ${buf.length} bytes`);
});

test('download: an admin may download any certificate', async () => {
  __setTestSession(ADMIN);
  const res = await get('cert-1');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/pdf');
});
