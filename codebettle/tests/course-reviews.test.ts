import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  createReview,
  getApprovedReviewsByCourse,
  getReviewById,
  getReviewsByCourse,
} from '../lib/db/reviews';
import {
  adminDeleteReviewService,
  adminUpdateReviewService,
  approveReviewService,
  createReviewService,
  deleteReviewService,
  rejectReviewService,
  updateReviewService,
} from '../lib/services/review-service';

const D = (s: string) => new Date(s);

let fake: FakeDb;

function seedBase() {
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'python', title: 'Python Crash Course', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Programming', level: 'beginner', pricePkr: 1500, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@example.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-3', name: 'Omar', email: 'omar@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', batchId: null, enrolledAt: D('2026-10-02'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 1500, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-2', courseId: 'course-1', batchId: null, enrolledAt: D('2026-10-02'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 1500, couponUsed: null, deletedAt: null },
  ]);
}

const student1 = { id: 'stu-1', role: 'student' as const, isAdmin: false, isTeacher: false };
const student2 = { id: 'stu-2', role: 'student' as const, isAdmin: false, isTeacher: false };
const student3 = { id: 'stu-3', role: 'student' as const, isAdmin: false, isTeacher: false };
const admin = { id: 'admin-1', role: 'admin' as const, isAdmin: true, isTeacher: false };

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedBase();
});

test.afterEach(() => {
  __resetDbClient();
});

test('rating must be a whole number from 1 to 5', async () => {
  for (const bad of [0, 6, 3.5]) {
    const result = await createReviewService(student1, { courseId: 'course-1', rating: bad, comment: 'ok' });
    assert.ok('error' in result, `rating ${bad} should be rejected`);
    assert.equal(result.status, 400);
  }
  const ok = await createReviewService(student1, { courseId: 'course-1', rating: 5, comment: 'Great course' });
  assert.ok(!('error' in ok));
  assert.equal(ok.review.rating, 5);
});

test('only enrolled students can review a course', async () => {
  // stu-3 has no enrolment for course-1.
  const result = await createReviewService(student3, { courseId: 'course-1', rating: 5, comment: 'Great' });
  assert.ok('error' in result);
  assert.equal(result.status, 403);
  const enrolled = await createReviewService(student1, { courseId: 'course-1', rating: 5, comment: 'Great' });
  assert.ok(!('error' in enrolled));
});

test('one review per student per course', async () => {
  const first = await createReviewService(student1, { courseId: 'course-1', rating: 5, comment: 'First' });
  assert.ok(!('error' in first));
  const second = await createReviewService(student1, { courseId: 'course-1', rating: 4, comment: 'Second' });
  assert.ok('error' in second);
  assert.equal(second.status, 409);
  // A different student can still review the same course.
  const other = await createReviewService(student2, { courseId: 'course-1', rating: 4, comment: 'Mine' });
  assert.ok(!('error' in other));
});

test('a new review starts pending and is hidden publicly until approved', async () => {
  const created = await createReviewService(student1, {
    courseId: 'course-1',
    rating: 5,
    title: 'Loved it',
    comment: 'Great course',
  });
  assert.ok(!('error' in created));
  assert.equal(created.review.status, 'pending');
  assert.equal(created.review.title, 'Loved it');
  // Public read sees nothing yet.
  assert.deepEqual(await getApprovedReviewsByCourse('course-1'), []);
  // The stored read (student/admin) still sees it.
  assert.equal((await getReviewsByCourse('course-1')).length, 1);
  // Course rating does not count a pending review.
  assert.equal(created.course?.rating, 0);
  assert.equal(created.course?.reviewCount, 0);

  const approved = await approveReviewService(admin, created.review.id);
  assert.ok(!('error' in approved));
  assert.equal(approved.review.status, 'approved');
  assert.deepEqual((await getApprovedReviewsByCourse('course-1')).map((r) => r.id), [created.review.id]);
  assert.equal(approved.course?.rating, 5);
  assert.equal(approved.course?.reviewCount, 1);
});

test('rejecting a review keeps it hidden and out of the course rating', async () => {
  const created = await createReviewService(student1, { courseId: 'course-1', rating: 2, comment: 'Not for me' });
  assert.ok(!('error' in created));
  const rejected = await rejectReviewService(admin, created.review.id);
  assert.ok(!('error' in rejected));
  assert.equal(rejected.review.status, 'rejected');
  assert.deepEqual(await getApprovedReviewsByCourse('course-1'), []);
  assert.equal(rejected.course?.rating, 0);
  assert.equal(rejected.course?.reviewCount, 0);
});

test('editing your own review sends it back to pending', async () => {
  const created = await createReviewService(student1, { courseId: 'course-1', rating: 5, comment: 'Great' });
  assert.ok(!('error' in created));
  await approveReviewService(admin, created.review.id);
  assert.equal((await getApprovedReviewsByCourse('course-1')).length, 1);

  const edited = await updateReviewService(student1, created.review.id, { rating: 4, comment: 'Still good' });
  assert.ok(!('error' in edited));
  assert.equal(edited.review.rating, 4);
  assert.equal(edited.review.status, 'pending');
  assert.deepEqual(await getApprovedReviewsByCourse('course-1'), []);
  assert.equal(edited.course?.rating, 0);

  // Another student cannot edit it.
  const foreign = await updateReviewService(student2, created.review.id, { comment: 'Hijack' });
  assert.ok('error' in foreign);
  assert.equal(foreign.status, 403);
});

test('admin can edit a review before publishing; delete is a real DB delete', async () => {
  const created = await createReviewService(student1, { courseId: 'course-1', rating: 3, comment: 'Okay' });
  assert.ok(!('error' in created));
  const edited = await adminUpdateReviewService(admin, created.review.id, {
    rating: 4,
    title: 'Better than I thought',
    status: 'approved',
  });
  assert.ok(!('error' in edited));
  assert.equal(edited.review.rating, 4);
  assert.equal(edited.review.title, 'Better than I thought');
  assert.equal(edited.review.status, 'approved');
  assert.equal(edited.course?.rating, 4);

  const deleted = await adminDeleteReviewService(admin, created.review.id);
  assert.ok(!('error' in deleted));
  assert.equal(await getReviewById(created.review.id), null);
  assert.deepEqual(await getApprovedReviewsByCourse('course-1'), []);
});

test('a student can delete their own review and it leaves the rating', async () => {
  const created = await createReviewService(student1, { courseId: 'course-1', rating: 5, comment: 'Great' });
  assert.ok(!('error' in created));
  await approveReviewService(admin, created.review.id);
  const deleted = await deleteReviewService(student1, created.review.id);
  assert.ok(!('error' in deleted));
  assert.equal(deleted.course?.rating, 0);
  assert.equal(deleted.course?.reviewCount, 0);
});

test('legacy rows without title/status/updatedAt read as approved', async () => {
  // The mapper default, exercised directly: a pre-migration row carries
  // no title/status/updatedAt, so it reads as approved with
  // updatedAt = createdAt (public from the start).
  const { mapReviewRow } = await import('../lib/db/mappers');
  const legacy = mapReviewRow({
    id: 'rev-legacy', studentId: 'stu-1', courseId: 'course-1', rating: 5,
    comment: 'Old review', createdAt: D('2024-05-03'),
  });
  assert.equal(legacy.title, null);
  assert.equal(legacy.status, 'approved');
  assert.equal(legacy.updatedAt, '2024-05-03');
  // A seeded legacy row (the fake applies the DB status default, like the
  // migration backfill) stays public.
  fake.seed('Review', [
    { id: 'rev-legacy', studentId: 'stu-1', courseId: 'course-1', rating: 5, comment: 'Old review', createdAt: D('2024-05-03') },
  ]);
  assert.equal((await getReviewsByCourse('course-1')).length, 1);
  assert.equal((await getApprovedReviewsByCourse('course-1')).length, 1);
});

test('createReview rejects a second review for the same student and course', async () => {
  const first = await createReview({ studentId: 'stu-1', courseId: 'course-1', rating: 5, comment: 'First' });
  assert.ok(!('error' in first));
  const second = await createReview({ studentId: 'stu-1', courseId: 'course-1', rating: 4, comment: 'Second' });
  assert.ok('error' in second);
  assert.equal(second.error, 'You have already reviewed this course');
});
