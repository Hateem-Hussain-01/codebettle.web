import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { getEnrollmentById, listEnrollments } from '../lib/db/enrollments';
import {
  createEnrollmentService,
  deleteEnrollmentService,
  updateEnrollmentService,
} from '../lib/services/enrollment-service';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);
const TODAY = new Date().toISOString().slice(0, 10);

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };
const INST: Actor = { id: 'inst-1', role: 'instructor', name: 'Usman' };
const STU: Actor = { id: 'stu-1', role: 'student', name: 'Ali' };

let fake: FakeDb;

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
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 1, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

test('admin creates an enrollment; duplicate is rejected', async () => {
  const created = await createEnrollmentService(ADMIN, {
    studentId: 'stu-2', courseId: 'course-1', paymentStatus: 'free', amountPaid: 0,
  });
  assert.ok('enrollment' in created, JSON.stringify(created));
  assert.equal(created.enrollment.studentId, 'stu-2');

  const dupe = await createEnrollmentService(ADMIN, {
    studentId: 'stu-1', courseId: 'course-1', paymentStatus: 'paid', amountPaid: 5000,
  });
  assert.ok('error' in dupe && dupe.status === 400, JSON.stringify(dupe));
});

test('create validates student, course and role', async () => {
  const noStudent = await createEnrollmentService(ADMIN, {
    studentId: 'ghost', courseId: 'course-1', paymentStatus: 'paid', amountPaid: 1,
  });
  assert.ok('error' in noStudent && noStudent.status === 404, JSON.stringify(noStudent));

  const noCourse = await createEnrollmentService(ADMIN, {
    studentId: 'stu-2', courseId: 'ghost', paymentStatus: 'paid', amountPaid: 1,
  });
  assert.ok('error' in noCourse && noCourse.status === 404, JSON.stringify(noCourse));

  const notStudent = await createEnrollmentService(ADMIN, {
    studentId: 'inst-1', courseId: 'course-1', paymentStatus: 'paid', amountPaid: 1,
  });
  assert.ok('error' in notStudent && notStudent.status === 400, JSON.stringify(notStudent));

  const asInstructor = await createEnrollmentService(INST, {
    studentId: 'stu-2', courseId: 'course-1', paymentStatus: 'paid', amountPaid: 1,
  });
  assert.ok('error' in asInstructor && asInstructor.status === 403, JSON.stringify(asInstructor));

  const asStudent = await createEnrollmentService(STU, {
    studentId: 'stu-2', courseId: 'course-1', paymentStatus: 'paid', amountPaid: 1,
  });
  assert.ok('error' in asStudent && asStudent.status === 403, JSON.stringify(asStudent));
});

test('marking complete stamps completedAt with today; un-completing clears it', async () => {
  const completed = await updateEnrollmentService(ADMIN, 'enr-1', { isCompleted: true });
  assert.ok('enrollment' in completed, JSON.stringify(completed));
  assert.equal(completed.enrollment.isCompleted, true);
  assert.equal(completed.enrollment.completedAt, TODAY);

  const withDate = await updateEnrollmentService(ADMIN, 'enr-1', { isCompleted: true, completedAt: '2024-06-01' });
  assert.ok('enrollment' in withDate, JSON.stringify(withDate));
  assert.equal(withDate.enrollment.completedAt, '2024-06-01');

  const undone = await updateEnrollmentService(ADMIN, 'enr-1', { isCompleted: false });
  assert.ok('enrollment' in undone, JSON.stringify(undone));
  assert.equal(undone.enrollment.isCompleted, false);
  assert.equal(undone.enrollment.completedAt, undefined);
});

test('update validates amount and existence; non-admin gets 403', async () => {
  const badAmount = await updateEnrollmentService(ADMIN, 'enr-1', { amountPaid: -5 });
  assert.ok('error' in badAmount && badAmount.status === 400, JSON.stringify(badAmount));

  const missing = await updateEnrollmentService(ADMIN, 'ghost', { amountPaid: 1 });
  assert.ok('error' in missing && missing.status === 404, JSON.stringify(missing));

  const asStudent = await updateEnrollmentService(STU, 'enr-1', { amountPaid: 1 });
  assert.ok('error' in asStudent && asStudent.status === 403, JSON.stringify(asStudent));
});

test('admin soft-deletes; it disappears from lists; second delete is 404', async () => {
  const deleted = await deleteEnrollmentService(ADMIN, 'enr-1');
  assert.ok('success' in deleted, JSON.stringify(deleted));
  assert.equal(await getEnrollmentById('enr-1'), null);
  assert.equal((await listEnrollments({})).total, 0);

  const again = await deleteEnrollmentService(ADMIN, 'enr-1');
  assert.ok('error' in again && again.status === 404, JSON.stringify(again));

  const asInstructor = await deleteEnrollmentService(INST, 'enr-1');
  assert.ok('error' in asInstructor && asInstructor.status === 403, JSON.stringify(asInstructor));
});
