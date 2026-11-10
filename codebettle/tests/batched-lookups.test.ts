import test from 'node:test';
import assert from 'node:assert/strict';
import { __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { getCoursesByIds } from '../lib/db/courses';
import { getEnrollmentsByCourseIds } from '../lib/db/enrollments';
import { getReviewsByCourseIds } from '../lib/db/reviews';
import { getCertificatesByStudentAndCourses } from '../lib/db/certificates';

/**
 * Phase 7 — batched lookups (N+1 fix).
 * The student dashboard, student courses page, wishlist, instructor
 * dashboard/students/reviews pages each fired one query per course or
 * per enrolment. The batch functions below do it in one query each;
 * the pages now use them. These tests pin the batch semantics: input
 * order, unknown ids skipped, empty input returns [] without a query.
 */

const D = (s: string) => new Date(s);

let fake: FakeDb;

function course(id: string, slug: string) {
  return {
    id, slug, title: slug, description: 'Intro', longDescription: 'Long',
    thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
    instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
    isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
    tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
    createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
  };
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-03') },
  ]);
  fake.seed('Course', [course('course-1', 'web-101'), course('course-2', 'py-101'), course('course-3', 'ds-101')]);
  fake.seed('Module', [
    { id: 'mod-1', courseId: 'course-1', title: 'Basics', position: 1 },
    { id: 'mod-2', courseId: 'course-2', title: 'Intro', position: 1 },
  ]);
  fake.seed('Lesson', [
    { id: 'les-1', moduleId: 'mod-1', title: 'L1', description: '', position: 1, recordingUrl: null, materials: [], duration: '10m', date: null },
    { id: 'les-2', moduleId: 'mod-2', title: 'L1', description: '', position: 1, recordingUrl: null, materials: [], duration: '10m', date: null },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-1', courseId: 'course-2', enrolledAt: D('2024-05-02'), isCompleted: true, completedAt: D('2024-06-01'), paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-3', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-03'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
  fake.seed('LessonProgress', [
    { enrollmentId: 'enr-1', lessonId: 'les-1', completedAt: D('2024-05-02') },
  ]);
  fake.seed('Review', [
    { id: 'rev-1', studentId: 'stu-1', courseId: 'course-1', rating: 5, comment: 'Great', createdAt: D('2024-05-03') },
    { id: 'rev-2', studentId: 'stu-2', courseId: 'course-2', rating: 4, comment: 'Good', createdAt: D('2024-05-04') },
  ]);
  fake.seed('Certificate', [
    { id: 'cert-1', studentId: 'stu-1', courseId: 'course-2', enrollmentId: 'enr-2', certificateNumber: 'CB-2024-001', verificationToken: 'a'.repeat(32), issuedAt: D('2024-06-01') },
    { id: 'cert-2', studentId: 'stu-2', courseId: 'course-1', enrollmentId: 'enr-3', certificateNumber: 'CB-2024-002', verificationToken: 'b'.repeat(32), issuedAt: D('2024-06-02') },
  ]);
});

test('getCoursesByIds returns input order with curriculum, skips unknown ids', async () => {
  const courses = await getCoursesByIds(['course-2', 'course-1', 'nope']);
  assert.deepEqual(courses.map((c) => c.id), ['course-2', 'course-1']);
  assert.equal(courses[0].modules.length, 1);
  assert.equal(courses[0].modules[0].lessons.length, 1);
  assert.equal(courses[1].modules[0].title, 'Basics');
  assert.deepEqual(await getCoursesByIds([]), []);
  assert.deepEqual((await getCoursesByIds(['course-1', 'course-1'])).map((c) => c.id), ['course-1']);
});

test('getEnrollmentsByCourseIds spans courses and carries lesson progress', async () => {
  const all = await getEnrollmentsByCourseIds(['course-1', 'course-2']);
  assert.equal(all.length, 3);
  assert.deepEqual(all.map((e) => e.id).sort(), ['enr-1', 'enr-2', 'enr-3']);
  const first = all.find((e) => e.id === 'enr-1')!;
  assert.deepEqual(first.completedLessons, ['les-1']);
  assert.deepEqual(await getEnrollmentsByCourseIds([]), []);
  assert.deepEqual(await getEnrollmentsByCourseIds(['course-3']), []);
});

test('getReviewsByCourseIds spans courses', async () => {
  const reviews = await getReviewsByCourseIds(['course-1', 'course-2']);
  assert.equal(reviews.length, 2);
  assert.deepEqual(reviews.map((r) => r.id).sort(), ['rev-1', 'rev-2']);
  assert.deepEqual(await getReviewsByCourseIds([]), []);
});

test('getCertificatesByStudentAndCourses is scoped to one student', async () => {
  const mine = await getCertificatesByStudentAndCourses('stu-1', ['course-1', 'course-2']);
  assert.deepEqual(mine.map((c) => c.id), ['cert-1']);
  const theirs = await getCertificatesByStudentAndCourses('stu-2', ['course-1', 'course-2']);
  assert.deepEqual(theirs.map((c) => c.id), ['cert-2']);
  assert.deepEqual(await getCertificatesByStudentAndCourses('stu-1', []), []);
});
