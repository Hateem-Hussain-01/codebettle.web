import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { getIntegritySummary } from '../lib/services/data-integrity-service';

const D = (s: string) => new Date(s);

let fake: FakeDb;

function seedConsistent() {
  fake.seed('User', [
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-3', name: 'Omar', email: 'omar@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
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
    { id: 'cert-1', studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1', certificateNumber: 'CB-2026-001', verificationToken: 'tok', issuedAt: D('2024-06-02') },
  ]);
  fake.seed('Review', [
    { id: 'rev-1', studentId: 'stu-1', courseId: 'course-1', rating: 5, comment: 'Great', createdAt: D('2024-06-03') },
  ]);
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
});

test.afterEach(() => {
  __resetDbClient();
});

test('each check flags a seeded inconsistency', async () => {
  seedConsistent();
  // Soft-deleted student + soft-deleted course.
  fake.seed('User', [
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01'), deletedAt: D('2024-07-01') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-2', slug: 'old-101', title: 'Old 101', description: 'Old', longDescription: '',
      thumbnail: '/t.png', category: 'Programming', level: 'beginner', pricePkr: 1000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'), deletedAt: D('2024-07-01'),
    },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-2', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-3', studentId: 'stu-1', courseId: 'course-2', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-4', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'free', amountPaid: 100, couponUsed: null, deletedAt: null },
  ]);
  fake.seed('Certificate', [
    { id: 'cert-2', studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-4', certificateNumber: 'CB-2026-002', verificationToken: 'tok', issuedAt: D('2024-06-02') },
  ]);
  fake.seed('Review', [
    { id: 'rev-2', studentId: 'ghost-student', courseId: 'course-1', rating: 4, comment: 'Orphan', createdAt: D('2024-06-03') },
    { id: 'rev-3', studentId: 'stu-1', courseId: 'ghost-course', rating: 4, comment: 'Orphan', createdAt: D('2024-06-03') },
  ]);

  const summary = await getIntegritySummary();
  assert.equal(summary.enrolmentsWithDeletedStudentOrCourse.count, 2);
  assert.deepEqual([...summary.enrolmentsWithDeletedStudentOrCourse.exampleIds].sort(), ['enr-2', 'enr-3']);
  assert.equal(summary.enrolmentsPaidButFree.count, 1);
  assert.deepEqual(summary.enrolmentsPaidButFree.exampleIds, ['enr-4']);
  assert.equal(summary.certificatesForIncompleteEnrolments.count, 1);
  assert.deepEqual(summary.certificatesForIncompleteEnrolments.exampleIds, ['cert-2']);
  assert.equal(summary.reviewsWithMissingStudentOrCourse.count, 2);
  assert.deepEqual([...summary.reviewsWithMissingStudentOrCourse.exampleIds].sort(), ['rev-2', 'rev-3']);
  assert.ok(summary.checkedAt);
});

test('consistent data reports clean counts', async () => {
  seedConsistent();
  const summary = await getIntegritySummary();
  assert.equal(summary.enrolmentsWithDeletedStudentOrCourse.count, 0);
  assert.equal(summary.enrolmentsPaidButFree.count, 0);
  assert.equal(summary.certificatesForIncompleteEnrolments.count, 0);
  assert.equal(summary.reviewsWithMissingStudentOrCourse.count, 0);
});

test('example ids are capped at 10', async () => {
  seedConsistent();
  const enrolments = Array.from({ length: 12 }, (_, i) => ({
    id: `enr-bad-${i}`, studentId: 'stu-1', courseId: 'course-1',
    enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null,
    paymentStatus: 'free', amountPaid: 50, couponUsed: null, deletedAt: null,
  }));
  fake.seed('Enrollment', enrolments);
  const summary = await getIntegritySummary();
  assert.equal(summary.enrolmentsPaidButFree.count, 12);
  assert.equal(summary.enrolmentsPaidButFree.exampleIds.length, 10);
});
