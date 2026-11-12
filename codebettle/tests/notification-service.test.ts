import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { getUnreadCount, listNotificationsByAnnouncement, listNotificationsForUser } from '../lib/db/notifications';
import {
  notifyEnrolledStudents,
  notifyUser,
  notifyUsers,
  onAnnouncementPublished,
  onApplicationReviewed,
  onCertificateIssued,
  onCourseCompleted,
  onEnrollmentCreated,
} from '../lib/services/notification-service';
import { deliverEmailNotification } from '../lib/services/email-notifications';

const D = (s: string) => new Date(s);

const DEFAULT_EVENTS = {
  enrollment: true,
  completion: true,
  certificate: true,
  application: true,
  announcement: true,
};

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  delete process.env.RESEND_API_KEY;
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
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
  delete process.env.RESEND_API_KEY;
});

test('notifyUser creates a row for the user with default prefs', async () => {
  const result = await notifyUser('stu-1', {
    type: 'enrollment',
    event: 'enrollment',
    title: 'Enrolled',
    body: 'Welcome to Web 101',
  });
  assert.ok(result.ok, JSON.stringify(result));
  assert.ok('notification' in result && result.notification, JSON.stringify(result));
  assert.equal(result.notification.userId, 'stu-1');
  assert.equal(result.notification.title, 'Enrolled');

  const page = await listNotificationsForUser('stu-1', {});
  assert.equal(page.total, 1);
  assert.equal(await getUnreadCount('stu-1'), 1);
});

test('prefs respected: inApp false skips the row; one event off skips only that event', async () => {
  // stu-2: in-app off entirely.
  fake.seed('User', [
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-03'), notificationPrefs: { inApp: false, email: false, events: { ...DEFAULT_EVENTS } } },
  ]);
  // stu-1: only the certificate event off.
  fake.seed('User', [
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02'), notificationPrefs: { inApp: true, email: false, events: { ...DEFAULT_EVENTS, certificate: false } } },
  ]);

  const off = await notifyUser('stu-2', { type: 'enrollment', event: 'enrollment', title: 'x', body: 'y' });
  assert.ok(off.ok && 'skipped' in off && off.skipped, JSON.stringify(off));
  assert.equal(off.reason, 'in-app-disabled');
  assert.equal((await listNotificationsForUser('stu-2', {})).total, 0);

  const certSkipped = await notifyUser('stu-1', { type: 'certificate', event: 'certificate', title: 'x', body: 'y' });
  assert.ok(certSkipped.ok && 'skipped' in certSkipped && certSkipped.skipped, JSON.stringify(certSkipped));
  assert.equal(certSkipped.reason, 'event-disabled');

  const enrolOk = await notifyUser('stu-1', { type: 'enrollment', event: 'enrollment', title: 'x', body: 'y' });
  assert.ok(enrolOk.ok && 'notification' in enrolOk, JSON.stringify(enrolOk));
  assert.equal((await listNotificationsForUser('stu-1', {})).total, 1);
});

test('notifyEnrolledStudents notifies only enrolled students', async () => {
  const summary = await notifyEnrolledStudents('course-1', {
    type: 'announcement',
    event: 'announcement',
    title: 'Class update',
    body: 'New lesson added to Web 101',
  });
  assert.equal(summary.sent, 1);
  assert.equal(summary.failed, 0);
  assert.equal((await listNotificationsForUser('stu-1', {})).total, 1);
  assert.equal((await listNotificationsForUser('stu-2', {})).total, 0);
});

test('onCertificateIssued targets the right student with the course title in the body', async () => {
  const result = await onCertificateIssued({
    id: 'cert-1',
    studentId: 'stu-1',
    courseId: 'course-1',
    enrollmentId: 'enr-1',
    issuedAt: '2024-06-01',
    certificateNumber: 'CB-2026-001',
    verificationToken: 'tok-1',
  });
  assert.ok(result.ok && 'notification' in result, JSON.stringify(result));
  assert.equal(result.notification.userId, 'stu-1');
  assert.match(result.notification.body, /Web 101/);
  assert.match(result.notification.body, /CB-2026-001/);
  assert.equal((await listNotificationsForUser('stu-2', {})).total, 0);
});

test('onEnrollmentCreated and onCourseCompleted notify the student; onApplicationReviewed notifies admins', async () => {
  const enrolled = await onEnrollmentCreated({
    id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: '2024-05-01',
    completedLessons: [], isCompleted: false, paymentStatus: 'paid', amountPaid: 5000,
  });
  assert.ok(enrolled.ok && 'notification' in enrolled, JSON.stringify(enrolled));
  assert.match(enrolled.notification.title, /Web 101/);

  const completed = await onCourseCompleted({
    id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: '2024-05-01',
    completedLessons: [], isCompleted: true, completedAt: '2024-06-01', paymentStatus: 'paid', amountPaid: 5000,
  });
  assert.ok(completed.ok && 'notification' in completed, JSON.stringify(completed));

  const reviewed = await onApplicationReviewed(
    { id: 'app-1', name: 'New Teacher', email: 'teacher@example.com', status: 'approved', createdAt: '2024-05-01' },
    'approved',
  );
  assert.equal(reviewed.sent, 1);
  assert.equal((await listNotificationsForUser('admin-1', {})).total, 1);
  assert.equal((await listNotificationsForUser('stu-1', {})).total, 2);
});

test('best-effort: a failing prefs lookup never throws; malformed prefs fall back to defaults', async () => {
  // Unknown user: prefs lookup finds nothing — no throw, ok:false.
  const ghost = await notifyUser('ghost-user', { type: 'enrollment', event: 'enrollment', title: 'x', body: 'y' });
  assert.equal(ghost.ok, false);

  // A bulk call containing a ghost user still completes for the rest.
  const summary = await notifyUsers(['stu-1', 'ghost-user'], {
    type: 'enrollment', event: 'enrollment', title: 'x', body: 'y',
  });
  assert.equal(summary.sent, 1);
  assert.equal(summary.failed, 1);

  // Malformed stored prefs (a string, not an object) fall back to defaults.
  fake.seed('User', [
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-03'), notificationPrefs: 'not-an-object' },
  ]);
  const fallback = await notifyUser('stu-2', { type: 'enrollment', event: 'enrollment', title: 'x', body: 'y' });
  assert.ok(fallback.ok && 'notification' in fallback, JSON.stringify(fallback));

  // Missing course still notifies with a generic title instead of throwing.
  const noCourse = await onEnrollmentCreated({
    id: 'enr-x', studentId: 'stu-1', courseId: 'ghost-course', enrolledAt: '2024-05-01',
    completedLessons: [], isCompleted: false, paymentStatus: 'paid', amountPaid: 0,
  });
  assert.ok(noCourse.ok && 'notification' in noCourse, JSON.stringify(noCourse));
});

test('onAnnouncementPublished fans out a course announcement with announcementId + course link (TeacherMessagePopup signal)', async () => {
  const summary = await onAnnouncementPublished({
    id: 'ann-1', title: 'Quiz moved', content: 'Quiz is now Thursday', type: 'course',
    courseId: 'course-1', authorId: 'admin-1', createdAt: '2024-05-01', isActive: true,
  });
  assert.equal(summary.sent, 1);
  assert.equal(summary.failed, 0);
  // Only the enrolled student got it.
  assert.equal((await listNotificationsForUser('stu-1', {})).total, 1);
  assert.equal((await listNotificationsForUser('stu-2', {})).total, 0);

  const rows = await listNotificationsByAnnouncement('ann-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, 'stu-1');
  assert.equal(rows[0].announcementId, 'ann-1');
  // Course deep link: isTeacherMessage() matches '/student/courses/'.
  assert.equal(rows[0].linkUrl, '/student/courses/course-1');
});

test('onAnnouncementPublished fans out site-wide; receipts show read/acknowledged states per recipient', async () => {
  const summary = await onAnnouncementPublished({
    id: 'ann-9', title: 'Holiday', content: 'No classes Friday', type: 'site-wide',
    authorId: 'admin-1', createdAt: '2024-05-01', isActive: true,
  });
  assert.equal(summary.sent, 3);
  const rows = await listNotificationsByAnnouncement('ann-9');
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.announcementId === 'ann-9'));
  assert.ok(rows.every((r) => r.linkUrl === undefined));

  const { acknowledgeNotification, markNotificationRead } = await import('../lib/db/notifications');
  const stu1Row = rows.find((r) => r.userId === 'stu-1');
  const stu2Row = rows.find((r) => r.userId === 'stu-2');
  assert.ok(stu1Row && stu2Row);
  await markNotificationRead('stu-1', stu1Row.id);
  await acknowledgeNotification('stu-2', stu2Row.id);

  const after = await listNotificationsByAnnouncement('ann-9');
  assert.equal(after.filter((r) => r.readAt).length, 2);
  assert.equal(after.filter((r) => r.acknowledgedAt).length, 1);
  assert.equal(after.find((r) => r.userId === 'stu-1')?.acknowledgedAt, null);
  assert.ok(after.find((r) => r.userId === 'stu-2')?.acknowledgedAt);
  assert.equal(after.find((r) => r.userId === 'admin-1')?.readAt, null);
});

test('double-publishing the same announcement does not duplicate notifications', async () => {
  const announcement = {
    id: 'ann-1', title: 'Quiz moved', content: 'Quiz is now Thursday', type: 'course' as const,
    courseId: 'course-1', authorId: 'admin-1', createdAt: '2024-05-01', isActive: true,
  };
  const first = await onAnnouncementPublished(announcement);
  assert.equal(first.sent, 1);
  assert.equal(first.skipped, 0);

  const second = await onAnnouncementPublished(announcement);
  assert.equal(second.sent, 0);
  assert.equal(second.skipped, 1);
  assert.equal(second.failed, 0);

  assert.equal((await listNotificationsByAnnouncement('ann-1')).length, 1);
  assert.equal((await listNotificationsForUser('stu-1', {})).total, 1);
});

test('email hook returns not-configured without throwing when RESEND_API_KEY is absent', async () => {
  const result = await deliverEmailNotification({
    to: 'ali@example.com',
    subject: 'Hi',
    body: 'Hello',
    type: 'enrollment',
    event: 'enrollment',
  });
  assert.deepEqual(result, { delivered: false, reason: 'email-not-configured' });

  // With email prefs on, the in-app row is still created and the hook
  // result is reported — the missing provider never blocks the row.
  fake.seed('User', [
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02'), notificationPrefs: { inApp: true, email: true, events: { ...DEFAULT_EVENTS } } },
  ]);
  const notified = await notifyUser('stu-1', { type: 'enrollment', event: 'enrollment', title: 'x', body: 'y' });
  assert.ok(notified.ok && 'notification' in notified, JSON.stringify(notified));
  assert.deepEqual(notified.email, { delivered: false, reason: 'email-not-configured' });
});
