import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { loadCommunicationsData } from '../app/admin/communications/communications-data';
import {
  announcementOrigin,
  computeReceiptSummary,
  deliveryStatusOf,
  isAnnouncementNotification,
  isTargetedNotification,
  isTeacherUser,
  matchesQuery,
  readRate,
  receiptStatusOf,
  summariseRequests,
} from '../app/admin/communications/communications-helpers';

const D = (s: string) => new Date(s);

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin One', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', isAdmin: true, isTeacher: false, status: 'active', joinedAt: D('2024-01-01') },
    { id: 'teacher-1', name: 'Tara Teacher', email: 'tara@example.com', passwordHash: '$2b$12$hash', role: 'instructor', isAdmin: false, isTeacher: true, status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', isAdmin: false, isTeacher: false, status: 'active', joinedAt: D('2024-01-03') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', isAdmin: false, isTeacher: false, status: 'active', joinedAt: D('2024-01-04') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'teacher-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 2, rating: 0, reviewCount: 0, deletedAt: null,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-02'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
  fake.seed('Announcement', [
    { id: 'ann-site', title: 'Welcome', content: 'Hello everyone', type: 'site_wide', courseId: null, authorId: 'admin-1', isActive: true, createdAt: D('2024-06-01') },
    { id: 'ann-course', title: 'Class moved', content: 'Tuesday class moves to 6pm', type: 'course', courseId: 'course-1', authorId: 'teacher-1', isActive: true, createdAt: D('2024-06-02') },
  ]);
  fake.seed('Notification', [
    // Admin-composed targeted send (Worker B): type 'announcement', NO announcementId.
    { id: 'not-target-teacher', userId: 'teacher-1', type: 'announcement', announcementId: null, title: 'Staff meeting', body: 'Meeting at 5pm', readAt: D('2024-06-03'), acknowledgedAt: null, createdAt: D('2024-06-03') },
    { id: 'not-target-student', userId: 'stu-1', type: 'announcement', announcementId: null, title: 'Fee reminder', body: 'Please pay', readAt: null, acknowledgedAt: null, createdAt: D('2024-06-04') },
    // System rows: excluded from the targeted tabs.
    { id: 'not-system', userId: 'stu-1', type: 'enrollment', announcementId: null, title: "You're enrolled", body: 'Welcome', readAt: null, acknowledgedAt: null, createdAt: D('2024-06-05') },
    { id: 'not-support', userId: 'admin-1', type: 'support_request', announcementId: null, title: 'New support request', body: 'Complaints: Help', readAt: null, acknowledgedAt: null, createdAt: D('2024-06-05') },
    // Announcement fan-out: announcementId set — excluded from targeted tabs.
    { id: 'not-announcement', userId: 'stu-2', type: 'announcement', announcementId: 'ann-course', title: 'Class moved', body: 'Tuesday class moves to 6pm', readAt: null, acknowledgedAt: null, createdAt: D('2024-06-06') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('isTeacherUser: flag or instructor role both count; a plain student does not', () => {
  assert.equal(isTeacherUser({ role: 'instructor', isTeacher: false }), true);
  assert.equal(isTeacherUser({ role: 'student', isTeacher: true }), true);
  assert.equal(isTeacherUser({ role: 'student', isTeacher: false }), false);
  assert.equal(isTeacherUser({ role: 'admin', isTeacher: false }), false);
});

test('announcementOrigin: teacher-authored when the author is a teacher, admin otherwise', () => {
  assert.equal(announcementOrigin({ role: 'instructor', isTeacher: true }), 'teacher');
  assert.equal(announcementOrigin({ role: 'student', isTeacher: true }), 'teacher');
  assert.equal(announcementOrigin({ role: 'admin', isTeacher: false }), 'admin');
  assert.equal(announcementOrigin(null), 'admin');
  assert.equal(announcementOrigin(undefined), 'admin');
});

test('isAnnouncementNotification: announcementId set means fan-out, even with type announcement', () => {
  assert.equal(isAnnouncementNotification({ type: 'announcement', announcementId: 'ann-1' }), true);
  assert.equal(isAnnouncementNotification({ type: 'announcement', announcementId: undefined }), false);
  assert.equal(isAnnouncementNotification({ type: 'announcement', announcementId: undefined }), false);
});

test('isTargetedNotification: only admin-composed sends; announcement fan-out + system rows excluded', () => {
  // Worker B's compose writes type 'announcement' with NO announcementId.
  assert.equal(isTargetedNotification({ type: 'announcement', announcementId: undefined }), true);
  assert.equal(isTargetedNotification({ type: 'announcement', announcementId: undefined }), true);
  assert.equal(isTargetedNotification({ type: 'targeted', announcementId: undefined }), true);
  // Fanned out from an announcement: announcementId is set.
  assert.equal(isTargetedNotification({ type: 'announcement', announcementId: 'ann-1' }), false);
  // System event rows.
  assert.equal(isTargetedNotification({ type: 'enrollment', announcementId: undefined }), false);
  assert.equal(isTargetedNotification({ type: 'completion', announcementId: undefined }), false);
  assert.equal(isTargetedNotification({ type: 'certificate', announcementId: undefined }), false);
  assert.equal(isTargetedNotification({ type: 'application', announcementId: undefined }), false);
  assert.equal(isTargetedNotification({ type: 'payment', announcementId: undefined }), false);
  assert.equal(isTargetedNotification({ type: 'support_request', announcementId: undefined }), false);
});

test('deliveryStatusOf: acknowledged beats read beats delivered', () => {
  assert.equal(deliveryStatusOf({ readAt: '2024-06-03', acknowledgedAt: '2024-06-04' }), 'acknowledged');
  assert.equal(deliveryStatusOf({ readAt: '2024-06-03', acknowledgedAt: null }), 'read');
  assert.equal(deliveryStatusOf({ readAt: null, acknowledgedAt: null }), 'delivered');
  assert.equal(deliveryStatusOf({}), 'delivered');
});

test('receiptStatusOf: acknowledged beats read beats delivered', () => {
  assert.equal(receiptStatusOf({ readAt: '2024-06-03', acknowledgedAt: '2024-06-04' }), 'acknowledged');
  assert.equal(receiptStatusOf({ readAt: '2024-06-03', acknowledgedAt: null }), 'read');
  assert.equal(receiptStatusOf({ readAt: null, acknowledgedAt: null }), 'delivered');
});

test('computeReceiptSummary: counts read/acknowledged from recipients; delivered is the remainder', () => {
  const summary = computeReceiptSummary({
    total: 3,
    recipients: [
      { userId: 'u1', name: 'A', email: 'a@x.com', readAt: '2024-06-03', acknowledgedAt: '2024-06-04' },
      { userId: 'u2', name: 'B', email: 'b@x.com', readAt: '2024-06-03', acknowledgedAt: null },
      { userId: 'u3', name: 'C', email: 'c@x.com', readAt: null, acknowledgedAt: null },
    ],
  });
  assert.deepEqual(summary, { total: 3, read: 2, acknowledged: 1, delivered: 1 });
});

test('readRate: whole-number percent, null when there is nothing to rate', () => {
  assert.equal(readRate(1, 2), 50);
  assert.equal(readRate(0, 0), null);
  assert.equal(readRate(3, 3), 100);
});

test('summariseRequests: counts by status (lowercased) and category, unknown fallbacks', () => {
  const summary = summariseRequests([
    { status: 'Open', category: 'Refund' },
    { status: 'open', category: 'Refund' },
    { status: 'Closed', category: 'Content' },
    {},
  ]);
  assert.equal(summary.total, 4);
  assert.deepEqual(summary.byStatus, { open: 2, closed: 1, unknown: 1 });
  assert.deepEqual(summary.byCategory, { Refund: 2, Content: 1, Uncategorised: 1 });
});

test('matchesQuery: case-insensitive substring across fields; empty query matches', () => {
  assert.equal(matchesQuery(['Hello World', 'x@y.com'], 'hello'), true);
  assert.equal(matchesQuery(['Hello World'], 'bye'), false);
  assert.equal(matchesQuery([null, undefined], ''), true);
  assert.equal(matchesQuery(['Ali'], 'ALI'), true);
});

// ---------------------------------------------------------------------------
// Data loader (fake db)
// ---------------------------------------------------------------------------

test('loadCommunicationsData: enriches announcements with author, course, origin and recipient counts', async () => {
  const data = await loadCommunicationsData();
  assert.equal(data.announcements.length, 2);

  const siteWide = data.announcements.find((e) => e.announcement.id === 'ann-site');
  assert.equal(siteWide?.authorName, 'Admin One');
  assert.equal(siteWide?.origin, 'admin');
  assert.equal(siteWide?.courseTitle, null);
  assert.equal(siteWide?.recipientCount, 4); // every user

  const course = data.announcements.find((e) => e.announcement.id === 'ann-course');
  assert.equal(course?.authorName, 'Tara Teacher');
  assert.equal(course?.authorIsTeacher, true);
  assert.equal(course?.origin, 'teacher');
  assert.equal(course?.courseTitle, 'Web 101');
  assert.equal(course?.recipientCount, 2); // the two enrolled students
});

test('loadCommunicationsData: targeted list keeps only admin-composed sends, with recipient role + read state', async () => {
  const data = await loadCommunicationsData();
  assert.deepEqual(
    data.targeted.map((t) => t.notification.id),
    ['not-target-student', 'not-target-teacher'], // newest first; system + announcement rows excluded
  );
  const toTeacher = data.targeted.find((t) => t.notification.id === 'not-target-teacher');
  assert.equal(toTeacher?.recipientName, 'Tara Teacher');
  assert.equal(toTeacher?.recipientRole, 'instructor');
  assert.equal(toTeacher?.status, 'read');
  const toStudent = data.targeted.find((t) => t.notification.id === 'not-target-student');
  assert.equal(toStudent?.recipientName, 'Ali');
  assert.equal(toStudent?.recipientRole, 'student');
  assert.equal(toStudent?.status, 'delivered');
});

test('loadCommunicationsData: stats count announcements by scope/origin and targeted read totals', async () => {
  const data = await loadCommunicationsData();
  assert.deepEqual(data.stats, {
    totalAnnouncements: 2,
    siteWideAnnouncements: 1,
    courseAnnouncements: 1,
    teacherAuthoredAnnouncements: 1,
    targetedSent: 2,
    targetedRead: 1,
  });
});
