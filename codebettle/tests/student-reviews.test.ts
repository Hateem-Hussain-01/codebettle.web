import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { createReviewService, deleteReviewService } from '../lib/services/review-service';
import { getCourseById } from '../lib/db/courses';
import { POST } from '../app/api/student/reviews/route';
import { DELETE } from '../app/api/student/reviews/[id]/route';
import type { SessionUser } from '../lib/services/auth-service';

/**
 * Phase 7 — real student reviews + rating recompute (CB-12 fix).
 * Before Phase 7 submit/delete were local-only fakes and
 * Course.rating/reviewCount never moved from their seed values.
 * Now: only enrolled students may review, once per course, and the
 * course stats are recomputed from the stored reviews on every
 * create/delete.
 */

const D = (s: string) => new Date(s);
const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };
const STU2: SessionUser = { id: 'stu-2', name: 'Sara', email: 'sara@example.com', role: 'student' };
const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function course(id: string, slug: string, rating = 0, reviewCount = 0) {
  return {
    id, slug, title: slug, description: 'Intro', longDescription: 'Long',
    thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
    instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
    isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
    tags: [], enrolledCount: 0, rating, reviewCount,
    createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
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
    // Deliberately stale seed stats (4.5/2) to prove the recompute overwrites them.
    course('course-1', 'web-101', 4.5, 2),
    course('course-2', 'python-101', 0, 0),
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-1', courseId: 'course-2', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-3', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
  fake.seed('Review', [
    { id: 'rev-1', studentId: 'stu-2', courseId: 'course-1', rating: 4, comment: 'Good', createdAt: D('2024-05-03') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// --- Service ---

test('create recomputes the course rating from stored reviews', async () => {
  const res = await createReviewService(STU1, { courseId: 'course-1', rating: 5, comment: 'Excellent!' });
  assert.ok('review' in res, JSON.stringify(res));
  assert.equal(res.review.rating, 5);
  // (4 + 5) / 2 = 4.5, count 2 — the stale seed stats (4.5/2) are replaced by real ones.
  const course = await getCourseById('course-1');
  assert.equal(course?.rating, 4.5);
  assert.equal(course?.reviewCount, 2);
  assert.equal(res.course?.rating, 4.5);
});

test('duplicate review is a 409', async () => {
  const res = await createReviewService(STU2, { courseId: 'course-1', rating: 5, comment: 'Again' });
  assert.ok('error' in res);
  assert.equal(res.status, 409);
});

test('reviewing a course you are not enrolled in is a 403', async () => {
  const res = await createReviewService(STU2, { courseId: 'course-2', rating: 5, comment: 'Never took it' });
  assert.ok('error' in res);
  assert.equal(res.status, 403);
});

test('bad rating, empty comment, unknown course and admin are rejected', async () => {
  for (const rating of [0, 6, 3.5]) {
    const res = await createReviewService(STU1, { courseId: 'course-2', rating, comment: 'x' });
    assert.ok('error' in res, `rating ${rating}`);
    assert.equal(res.status, 400);
  }
  const empty = await createReviewService(STU1, { courseId: 'course-2', rating: 5, comment: '   ' });
  assert.ok('error' in empty);
  assert.equal(empty.status, 400);
  const unknown = await createReviewService(STU1, { courseId: 'nope', rating: 5, comment: 'x' });
  assert.ok('error' in unknown);
  assert.equal(unknown.status, 404);
  const admin = await createReviewService(ADMIN, { courseId: 'course-1', rating: 5, comment: 'x' });
  assert.ok('error' in admin);
  assert.equal(admin.status, 403);
});

test('deleting your own review recomputes the rating; deleting another student’s is 403', async () => {
  // stu-1 adds a 5, then deletes it: course-1 returns to the single 4-star review.
  const created = await createReviewService(STU1, { courseId: 'course-1', rating: 5, comment: 'Great' });
  assert.ok('review' in created);
  const deleted = await deleteReviewService(STU1, created.review.id);
  assert.ok('success' in deleted, JSON.stringify(deleted));
  const course = await getCourseById('course-1');
  assert.equal(course?.rating, 4);
  assert.equal(course?.reviewCount, 1);

  const others = await deleteReviewService(STU1, 'rev-1');
  assert.ok('error' in others);
  assert.equal(others.status, 403);
  const missing = await deleteReviewService(STU1, 'nope');
  assert.ok('error' in missing);
  assert.equal(missing.status, 404);
});

// --- Routes ---

test('POST /api/student/reviews: 201 for an enrolled student, 401 signed out, 409 duplicate', async () => {
  __setTestSession(STU1);
  const ok = await POST(jsonReq('http://localhost/api/student/reviews', 'POST', {
    courseId: 'course-2', rating: 4, comment: 'Solid intro',
  }));
  assert.equal(ok.status, 201);
  const body = await ok.json() as { course: { rating: number; reviewCount: number } };
  assert.equal(body.course.rating, 4);
  assert.equal(body.course.reviewCount, 1);

  const dup = await POST(jsonReq('http://localhost/api/student/reviews', 'POST', {
    courseId: 'course-2', rating: 5, comment: 'Again',
  }));
  assert.equal(dup.status, 409);

  __setTestSession(null);
  const anon = await POST(jsonReq('http://localhost/api/student/reviews', 'POST', {
    courseId: 'course-2', rating: 5, comment: 'x',
  }));
  assert.equal(anon.status, 401);
});

test('DELETE /api/student/reviews/[id]: 200 for the owner, 403 for another student', async () => {
  __setTestSession(STU1);
  const notMine = await DELETE(new NextRequest('http://localhost/api/student/reviews/rev-1', { method: 'DELETE' }), {
    params: Promise.resolve({ id: 'rev-1' }),
  });
  assert.equal(notMine.status, 403);
  __setTestSession(STU2);
  const mine = await DELETE(new NextRequest('http://localhost/api/student/reviews/rev-1', { method: 'DELETE' }), {
    params: Promise.resolve({ id: 'rev-1' }),
  });
  assert.equal(mine.status, 200);
  const body = await mine.json() as { course: { rating: number; reviewCount: number } };
  assert.equal(body.course.rating, 0);
  assert.equal(body.course.reviewCount, 0);
});
