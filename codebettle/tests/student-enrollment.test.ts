import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { enrollSelfService } from '../lib/services/enrollment-service';
import { getEnrollmentsByStudent } from '../lib/db/enrollments';
import { POST } from '../app/api/student/enrollments/route';
import type { SessionUser } from '../lib/services/auth-service';

/**
 * Phase 7 — student self-enrolment.
 * Before Phase 7 the enrol button was fake (toast + redirect to login)
 * and no student enrolment route existed. Now: free courses enrol as
 * 'free', paid courses enrol as 'pending' (no payment gateway — an
 * admin confirms payment later), duplicates are 409, draft/archived
 * courses reject, coupons are re-validated server-side, and only
 * students can enrol themselves (the actor IS the student — nobody
 * can enrol anyone else through this path).
 */

const D = (s: string) => new Date(s);

const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };
const STU2: SessionUser = { id: 'stu-2', name: 'Sara', email: 'sara@example.com', role: 'student' };
const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const INST1: SessionUser = { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', role: 'instructor' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function course(id: string, slug: string, overrides: Record<string, unknown> = {}) {
  return {
    id, slug, title: slug, description: 'Intro', longDescription: 'Long',
    thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
    instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
    isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
    tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
    createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    ...overrides,
  };
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-03') },
  ]);
  fake.seed('Course', [
    course('course-free', 'free-101', { isFree: true, pricePkr: 0 }),
    course('course-paid', 'paid-101', { isFree: false, pricePkr: 5000 }),
    course('course-draft', 'draft-101', { status: 'draft' }),
    course('course-archived', 'arch-101', { status: 'archived' }),
  ]);
  fake.seed('Coupon', [
    { id: 'coup-1', code: 'WELCOME10', type: 'percentage', value: 10, maxUses: 100, usedCount: 2, expiresAt: D('2030-01-01'), isActive: true, createdAt: D('2024-01-01'), applicableCourses: [] },
    { id: 'coup-2', code: 'OLD', type: 'fixed', value: 500, maxUses: 10, usedCount: 0, expiresAt: D('2020-01-01'), isActive: true, createdAt: D('2024-01-01'), applicableCourses: [] },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-paid', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// --- Service ---

test('free course enrols as free with amountPaid 0', async () => {
  const res = await enrollSelfService(STU2, { courseId: 'course-free' });
  assert.ok('enrollment' in res, JSON.stringify(res));
  assert.equal(res.enrollment.studentId, 'stu-2');
  assert.equal(res.enrollment.courseId, 'course-free');
  assert.equal(res.enrollment.paymentStatus, 'free');
  assert.equal(res.enrollment.amountPaid, 0);
  const mine = await getEnrollmentsByStudent('stu-2');
  assert.equal(mine.length, 1);
});

test('paid course enrols as pending with amountPaid 0 (no payment gateway)', async () => {
  const res = await enrollSelfService(STU2, { courseId: 'course-paid' });
  assert.ok('enrollment' in res, JSON.stringify(res));
  assert.equal(res.enrollment.paymentStatus, 'pending');
  assert.equal(res.enrollment.amountPaid, 0);
});

test('duplicate enrolment is a 409', async () => {
  const res = await enrollSelfService(STU1, { courseId: 'course-paid' });
  assert.ok('error' in res);
  assert.equal(res.status, 409);
});

test('draft and archived courses reject with 400', async () => {
  for (const courseId of ['course-draft', 'course-archived']) {
    const res = await enrollSelfService(STU2, { courseId });
    assert.ok('error' in res, courseId);
    assert.equal(res.status, 400);
  }
});

test('unknown course is a 404', async () => {
  const res = await enrollSelfService(STU2, { courseId: 'nope' });
  assert.ok('error' in res);
  assert.equal(res.status, 404);
});

test('admins and instructors cannot self-enrol (403)', async () => {
  for (const actor of [ADMIN, INST1]) {
    const res = await enrollSelfService(actor, { courseId: 'course-free' });
    assert.ok('error' in res, actor.role);
    assert.equal(res.status, 403);
  }
});

test('valid coupon is recorded; invalid/expired coupon is a 400', async () => {
  const ok = await enrollSelfService(STU2, { courseId: 'course-free', couponCode: 'welcome10' });
  assert.ok('enrollment' in ok, JSON.stringify(ok));
  assert.equal(ok.enrollment.couponUsed, 'WELCOME10');
  const bad = await enrollSelfService(STU2, { courseId: 'course-paid', couponCode: 'OLD' });
  assert.ok('error' in bad);
  assert.equal(bad.status, 400);
  const missing = await enrollSelfService(STU2, { courseId: 'course-paid', couponCode: 'NOPE' });
  assert.ok('error' in missing);
  assert.equal(missing.status, 400);
});

// --- Route ---

test('POST /api/student/enrollments: 201 for a student, 401 signed out, 403 admin', async () => {
  __setTestSession(STU2);
  const ok = await POST(jsonReq('http://localhost/api/student/enrollments', 'POST', { courseId: 'course-free' }));
  assert.equal(ok.status, 201);
  const body = await ok.json() as { enrollment: { paymentStatus: string } };
  assert.equal(body.enrollment.paymentStatus, 'free');

  __setTestSession(null);
  const anon = await POST(jsonReq('http://localhost/api/student/enrollments', 'POST', { courseId: 'course-free' }));
  assert.equal(anon.status, 401);

  __setTestSession(ADMIN);
  const admin = await POST(jsonReq('http://localhost/api/student/enrollments', 'POST', { courseId: 'course-free' }));
  assert.equal(admin.status, 403);
});

test('POST /api/student/enrollments: duplicate is 409, missing courseId is 400', async () => {
  __setTestSession(STU1);
  const dup = await POST(jsonReq('http://localhost/api/student/enrollments', 'POST', { courseId: 'course-paid' }));
  assert.equal(dup.status, 409);
  const bad = await POST(jsonReq('http://localhost/api/student/enrollments', 'POST', {}));
  assert.equal(bad.status, 400);
});
