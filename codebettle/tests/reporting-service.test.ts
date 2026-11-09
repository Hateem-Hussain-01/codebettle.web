import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  getAdminOverview,
  getCourseReport,
  getDataIntegritySummary,
  getInstructorReport,
  getStudentReport,
} from '../lib/services/reporting-service';

const D = (s: string) => new Date(s);

let fake: FakeDb;

function courseRow(
  id: string,
  title: string,
  instructorId: string,
  status: string,
  pricePkr = 5000,
): Record<string, unknown> {
  return {
    id,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title,
    description: 'Intro',
    longDescription: 'Long',
    thumbnail: '/t.png',
    category: 'Web_Development',
    level: 'beginner',
    pricePkr,
    isFree: pricePkr === 0,
    instructorId,
    zoomLink: null,
    schedule: null,
    status,
    isFeatured: false,
    isCompleted: false,
    completedAt: null,
    requirements: [],
    whatYouLearn: [],
    tags: [],
    enrolledCount: 0,
    rating: 0,
    reviewCount: 0,
    createdAt: D('2024-04-01'),
    updatedAt: D('2024-04-01'),
  };
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-2', name: 'Sara', email: 'sara@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara S', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-03') },
    { id: 'stu-deleted', name: 'Gone', email: 'gone@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-04'), deletedAt: D('2024-05-20') },
  ]);
  fake.seed('Course', [
    courseRow('course-1', 'Web 101', 'inst-1', 'published', 5000),
    courseRow('course-2', 'Data, "Science" 101', 'inst-2', 'published', 2000),
    courseRow('course-3', 'Draft Course', 'inst-1', 'draft', 0),
  ]);
  fake.seed('Module', [
    { id: 'mod-1', courseId: 'course-1', title: 'Basics', position: 1 },
    { id: 'mod-2', courseId: 'course-2', title: 'Intro', position: 1 },
  ]);
  fake.seed('Lesson', [
    { id: 'les-1', moduleId: 'mod-1', title: 'L1', description: '', position: 1, recordingUrl: null, materials: [], duration: '10m', date: null },
    { id: 'les-2', moduleId: 'mod-1', title: 'L2', description: '', position: 2, recordingUrl: null, materials: [], duration: '10m', date: null },
    { id: 'les-3', moduleId: 'mod-2', title: 'L1', description: '', position: 1, recordingUrl: null, materials: [], duration: '10m', date: null },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: true, completedAt: D('2024-06-01'), paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-10'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 3000, couponUsed: null, deletedAt: null },
    { id: 'enr-3', studentId: 'stu-1', courseId: 'course-2', enrolledAt: D('2024-04-15'), isCompleted: true, completedAt: D('2024-04-20'), paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-4', studentId: 'stu-2', courseId: 'course-2', enrolledAt: D('2024-05-31'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 2000, couponUsed: null, deletedAt: null },
    { id: 'enr-5', studentId: 'stu-2', courseId: 'course-2', enrolledAt: D('2024-06-05'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 1000, couponUsed: null, deletedAt: null },
  ]);
  // LessonProgress has a composite key (no id column), so the fake's
  // seed() — which keys rows by id — needs a synthetic id per row,
  // otherwise later rows overwrite earlier ones under `undefined`.
  fake.seed('LessonProgress', [
    { id: 'lp-1', enrollmentId: 'enr-1', lessonId: 'les-1', completedAt: D('2024-05-02') },
    { id: 'lp-2', enrollmentId: 'enr-1', lessonId: 'les-2', completedAt: D('2024-05-03') },
    { id: 'lp-3', enrollmentId: 'enr-2', lessonId: 'les-1', completedAt: D('2024-05-11') },
    { id: 'lp-4', enrollmentId: 'enr-3', lessonId: 'les-3', completedAt: D('2024-04-16') },
  ]);
  fake.seed('Certificate', [
    { id: 'cert-1', studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1', certificateNumber: 'CB-2024-001', verificationToken: 'tok1', issuedAt: D('2024-06-02') },
    { id: 'cert-2', studentId: 'stu-1', courseId: 'course-2', enrollmentId: 'enr-3', certificateNumber: 'CB-2024-002', verificationToken: 'tok2', issuedAt: D('2024-04-20') },
  ]);
  fake.seed('Review', [
    { id: 'rev-1', studentId: 'stu-1', courseId: 'course-1', rating: 5, comment: 'Great', createdAt: D('2024-06-03') },
    { id: 'rev-2', studentId: 'stu-2', courseId: 'course-1', rating: 4, comment: 'Good', createdAt: D('2024-05-15') },
    { id: 'rev-3', studentId: 'stu-1', courseId: 'course-2', rating: 3, comment: 'OK', createdAt: D('2024-04-25') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

test('overview totals: revenue math, completion rate, ratings, all-time counts', async () => {
  const overview = await getAdminOverview({});
  assert.ok(!('error' in overview), JSON.stringify(overview));
  assert.deepEqual(overview.usersByRole, { student: 2, instructor: 2, admin: 1, total: 5 });
  assert.equal(overview.totalEnrollments, 5);
  assert.equal(overview.completedEnrollments, 2);
  assert.equal(overview.completionRate, 40);
  assert.equal(overview.totalRevenue, 11000);
  assert.equal(overview.certificatesIssued, 2);
  assert.equal(overview.coursesPublished, 2);
  assert.equal(overview.totalCourses, 3);
  assert.equal(overview.averageRating, 4);
  assert.equal(overview.totalReviews, 3);
});

test('overview date filter includes boundary rows and excludes the rest', async () => {
  const overview = await getAdminOverview({ from: '2024-05-01', to: '2024-05-31' });
  assert.ok(!('error' in overview), JSON.stringify(overview));
  // enr-1 (05-01, boundary), enr-2, enr-4 (05-31, boundary); enr-3 (April) and enr-5 (June) out.
  assert.equal(overview.totalEnrollments, 3);
  assert.equal(overview.completedEnrollments, 1);
  assert.equal(overview.completionRate, 33.3);
  assert.equal(overview.totalRevenue, 10000);
  // No certificate was issued in May (June 2 and April 20 are out).
  assert.equal(overview.certificatesIssued, 0);
  // Only rev-2 (May 15) is in range.
  assert.equal(overview.averageRating, 4);
  assert.equal(overview.totalReviews, 1);
});

test('overview: invalid dates and reversed ranges are 400 errors', async () => {
  for (const range of [
    { from: 'not-a-date' },
    { from: '2024-13-01' },
    { from: '2024-02-30' },
    { to: '2024-05-32' },
    { from: '2024-06-01', to: '2024-05-01' },
  ]) {
    const result = await getAdminOverview(range);
    assert.ok('error' in result && result.status === 400, JSON.stringify(result));
  }
  // A single-day range is valid.
  const oneDay = await getAdminOverview({ from: '2024-05-01', to: '2024-05-01' });
  assert.ok(!('error' in oneDay), JSON.stringify(oneDay));
  assert.equal(oneDay.totalEnrollments, 1);
});

// ---------------------------------------------------------------------------
// Course report
// ---------------------------------------------------------------------------

test('course report: revenue, completion and ratings per course', async () => {
  const report = await getCourseReport('course-1', {});
  assert.ok(!('error' in report), JSON.stringify(report));
  assert.equal(report.enrollments, 2);
  assert.equal(report.completions, 1);
  assert.equal(report.completionRate, 50);
  assert.equal(report.revenue, 8000);
  assert.equal(report.averageRating, 4.5);
  assert.equal(report.reviewCount, 2);
  assert.equal(report.enrolledStudents, 2);

  const may = await getCourseReport('course-1', { from: '2024-05-01', to: '2024-05-31' });
  assert.ok(!('error' in may), JSON.stringify(may));
  assert.equal(may.enrollments, 2);
  // Only rev-2 is in May; rev-1 is June.
  assert.equal(may.averageRating, 4);
  assert.equal(may.reviewCount, 1);

  const missing = await getCourseReport('ghost', {});
  assert.ok('error' in missing && missing.status === 404, JSON.stringify(missing));
});

// ---------------------------------------------------------------------------
// Student report
// ---------------------------------------------------------------------------

test('student report: totals and per-course progress fractions', async () => {
  const ali = await getStudentReport('stu-1', {});
  assert.ok(!('error' in ali), JSON.stringify(ali));
  assert.equal(ali.enrollments, 2);
  assert.equal(ali.completed, 2);
  assert.equal(ali.certificates, 2);
  assert.equal(ali.totalAmountPaid, 5000);
  assert.deepEqual(
    ali.courses.map((c) => [c.courseId, c.completedLessons, c.totalLessons, c.progressPercent]),
    [
      ['course-1', 2, 2, 100],
      ['course-2', 1, 1, 100],
    ],
  );

  const sara = await getStudentReport('stu-2', {});
  assert.ok(!('error' in sara), JSON.stringify(sara));
  assert.equal(sara.enrollments, 3);
  assert.equal(sara.completed, 0);
  assert.equal(sara.certificates, 0);
  assert.equal(sara.totalAmountPaid, 6000);
  const web = sara.courses.find((c) => c.courseId === 'course-1');
  assert.equal(web?.completedLessons, 1);
  assert.equal(web?.totalLessons, 2);
  assert.equal(web?.progressPercent, 50);

  const missing = await getStudentReport('ghost', {});
  assert.ok('error' in missing && missing.status === 404, JSON.stringify(missing));
  const notAStudent = await getStudentReport('inst-1', {});
  assert.ok('error' in notAStudent && notAStudent.status === 404, JSON.stringify(notAStudent));
});

// ---------------------------------------------------------------------------
// Instructor report (ownership scope)
// ---------------------------------------------------------------------------

test('instructor report: only the instructor’s own courses appear', async () => {
  const usman = await getInstructorReport('inst-1', {});
  assert.ok(!('error' in usman), JSON.stringify(usman));
  assert.deepEqual(
    usman.courses.map((c) => c.courseId).sort(),
    ['course-1', 'course-3'],
  );
  assert.equal(usman.enrollments, 2);
  assert.equal(usman.revenue, 8000);
  assert.equal(usman.completionRate, 50);
  assert.equal(usman.enrolledStudents, 2);
  const draft = usman.courses.find((c) => c.courseId === 'course-3');
  assert.equal(draft?.enrollments, 0);
  assert.equal(draft?.revenue, 0);

  const sara = await getInstructorReport('inst-2', {});
  assert.ok(!('error' in sara), JSON.stringify(sara));
  assert.deepEqual(
    sara.courses.map((c) => c.courseId),
    ['course-2'],
  );
  assert.equal(sara.enrollments, 3);
  assert.equal(sara.revenue, 3000);
  assert.equal(sara.averageRating, 3);

  const missing = await getInstructorReport('ghost', {});
  assert.ok('error' in missing && missing.status === 404, JSON.stringify(missing));
  const notAnInstructor = await getInstructorReport('stu-1', {});
  assert.ok('error' in notAnInstructor && notAnInstructor.status === 404, JSON.stringify(notAnInstructor));
});

// ---------------------------------------------------------------------------
// Integrity summary
// ---------------------------------------------------------------------------

test('integrity summary: clean base data has zero issues', async () => {
  const summary = await getDataIntegritySummary();
  assert.equal(summary.totalIssues, 0);
  for (const check of summary.checks) assert.equal(check.count, 0, check.key);
});

test('integrity summary: each seeded inconsistency is flagged', async () => {
  fake.seed('Enrollment', [
    { id: 'enr-orphan', studentId: 'stu-deleted', courseId: 'course-1', enrolledAt: D('2024-05-02'), isCompleted: false, completedAt: null, paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-paid-free', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-12'), isCompleted: false, completedAt: null, paymentStatus: 'free', amountPaid: 1500, couponUsed: null, deletedAt: null },
  ]);
  fake.seed('Certificate', [
    { id: 'cert-bad', studentId: 'stu-2', courseId: 'course-1', enrollmentId: 'enr-2', certificateNumber: 'CB-2024-099', verificationToken: 'tok9', issuedAt: D('2024-05-20') },
  ]);
  fake.seed('Review', [
    { id: 'rev-ghost', studentId: 'ghost', courseId: 'course-1', rating: 1, comment: 'No enrolment', createdAt: D('2024-05-20') },
  ]);

  const summary = await getDataIntegritySummary();
  const byKey = new Map(summary.checks.map((c) => [c.key, c]));
  assert.ok(byKey.get('orphanedEnrollments')?.exampleIds.includes('enr-orphan'));
  assert.ok(byKey.get('paidButFree')?.exampleIds.includes('enr-paid-free'));
  assert.ok(byKey.get('certificatesForIncomplete')?.exampleIds.includes('cert-bad'));
  assert.ok(byKey.get('reviewsWithoutEnrollment')?.exampleIds.includes('rev-ghost'));
  assert.equal(summary.totalIssues, 4);
  for (const check of summary.checks) {
    assert.ok(check.exampleIds.length <= 10, check.key);
  }
});
