import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { listNotificationsForUser } from '../lib/db/notifications';
import { onEnrollmentCreatedForInstructor } from '../lib/services/notification-service';
import { createEnrollmentService, enrollSelfService } from '../lib/services/enrollment-service';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };
const STU2: Actor = { id: 'stu-2', role: 'student', name: 'Sara' };

let fake: FakeDb;

function courseRow(id: string, instructorId: string, pricePkr: number) {
  return {
    id, slug: `slug-${id}`, title: `Course ${id}`, description: 'Intro', longDescription: '',
    thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr, isFree: false,
    instructorId, zoomLink: null, schedule: null, status: 'published',
    isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
    tags: [], enrolledCount: 1, rating: 0, reviewCount: 0,
    createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
  };
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  delete process.env.RESEND_API_KEY;
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-03') },
  ]);
  fake.seed('Course', [courseRow('course-1', 'inst-1', 1500)]);
});

test.afterEach(() => {
  __resetDbClient();
  delete process.env.RESEND_API_KEY;
});

/** The instructor message must never mention money — any of these words fails the test. */
const FORBIDDEN = ['pkr', 'fee', 'price', 'paid', 'amount', '1500', 'rs ', 'rs.'];
function assertNoFeeMention(text: string): void {
  const lower = text.toLowerCase();
  for (const word of FORBIDDEN) {
    assert.ok(!lower.includes(word), `instructor message must not mention money — found "${word}" in: ${text}`);
  }
}

test('instructor enrollment: name only — student name + course, never the fee', async () => {
  const enrollment = {
    id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: '2024-05-01',
    isCompleted: false, paymentStatus: 'pending' as const,
    amountPaid: 0, completedLessons: [],
  };
  const result = await onEnrollmentCreatedForInstructor(enrollment);
  assert.ok(result.ok, JSON.stringify(result));
  assert.ok('notification' in result && result.notification, JSON.stringify(result));
  assert.equal(result.notification.userId, 'inst-1');
  assert.ok(result.notification.title.includes('Ali'), result.notification.title);
  assert.ok(result.notification.body.includes('Ali'), result.notification.body);
  assert.ok(result.notification.body.includes('Course course-1'), result.notification.body);
  assert.equal(result.notification.title, 'New enrollment from Ali');
  assertNoFeeMention(result.notification.title);
  assertNoFeeMention(result.notification.body);

  const page = await listNotificationsForUser('inst-1', {});
  assert.equal(page.total, 1);
});

test('instructor enrollment: admin-created enrollment notifies the instructor too', async () => {
  const created = await createEnrollmentService(ADMIN, {
    studentId: 'stu-2', courseId: 'course-1', paymentStatus: 'pending', amountPaid: 0,
  });
  assert.ok('enrollment' in created, JSON.stringify(created));

  const instructorNotes = await listNotificationsForUser('inst-1', {});
  assert.equal(instructorNotes.total, 1);
  assert.equal(instructorNotes.items[0].title, 'New enrollment from Sara');
  assertNoFeeMention(instructorNotes.items[0].title);
  assertNoFeeMention(instructorNotes.items[0].body);

  // The student still gets their own enrolment notification.
  const studentNotes = await listNotificationsForUser('stu-2', {});
  assert.equal(studentNotes.total, 1);
  assert.ok(studentNotes.items[0].title.includes("You're enrolled"), studentNotes.items[0].title);
});

test('instructor enrollment: self-enrollment notifies the instructor too', async () => {
  const created = await enrollSelfService(STU2, { courseId: 'course-1' });
  assert.ok('enrollment' in created, JSON.stringify(created));

  const instructorNotes = await listNotificationsForUser('inst-1', {});
  assert.equal(instructorNotes.total, 1);
  assert.equal(instructorNotes.items[0].title, 'New enrollment from Sara');
  assertNoFeeMention(instructorNotes.items[0].title);
  assertNoFeeMention(instructorNotes.items[0].body);
});

test('instructor enrollment: missing course fails gracefully (no throw, no notification)', async () => {
  const enrollment = {
    id: 'enr-x', studentId: 'stu-1', courseId: 'no-such-course', enrolledAt: '2024-05-01',
    isCompleted: false, paymentStatus: 'pending' as const,
    amountPaid: 0, completedLessons: [],
  };
  const result = await onEnrollmentCreatedForInstructor(enrollment);
  assert.equal(result.ok, false);
  const page = await listNotificationsForUser('inst-1', {});
  assert.equal(page.total, 0);
});

test('instructor enrollment: unknown instructor user fails gracefully (no throw)', async () => {
  fake.seed('Course', [courseRow('course-2', 'ghost-instructor', 1500)]);
  const enrollment = {
    id: 'enr-y', studentId: 'stu-1', courseId: 'course-2', enrolledAt: '2024-05-01',
    isCompleted: false, paymentStatus: 'pending' as const,
    amountPaid: 0, completedLessons: [],
  };
  const result = await onEnrollmentCreatedForInstructor(enrollment);
  // notifyUser returns user-not-found — the enrolment itself is unaffected.
  assert.equal(result.ok, false);
});
