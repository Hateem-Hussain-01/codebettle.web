import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import type { SessionUser } from '../lib/services/auth-service';

const D = (s: string) => new Date(s);

const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const INST1: SessionUser = { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', role: 'instructor' };
const INST2: SessionUser = { id: 'inst-2', name: 'Sara', email: 'sara@codebettle.com', role: 'instructor' };
const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };

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
  ]);
  fake.seed('Course', [
    courseRow('course-1', 'Web 101', 'inst-1', 'published', 5000),
    // Deliberately awkward title: comma + quote must round-trip through CSV.
    courseRow('course-2', 'Data, "Science" 101', 'inst-2', 'published', 2000),
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
  ]);
  // LessonProgress has a composite key (no id column), so the fake's
  // seed() — which keys rows by id — needs a synthetic id per row.
  fake.seed('LessonProgress', [
    { id: 'lp-1', enrollmentId: 'enr-1', lessonId: 'les-1', completedAt: D('2024-05-02') },
    { id: 'lp-2', enrollmentId: 'enr-1', lessonId: 'les-2', completedAt: D('2024-05-03') },
  ]);
  fake.seed('Certificate', [
    { id: 'cert-1', studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1', certificateNumber: 'CB-2024-001', verificationToken: 'tok1', issuedAt: D('2024-06-02') },
  ]);
  fake.seed('Review', [
    { id: 'rev-1', studentId: 'stu-1', courseId: 'course-1', rating: 5, comment: 'Great', createdAt: D('2024-06-03') },
    { id: 'rev-2', studentId: 'stu-2', courseId: 'course-1', rating: 4, comment: 'Good', createdAt: D('2024-05-15') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ---------------------------------------------------------------------------
// GET /api/admin/reports
// ---------------------------------------------------------------------------

test('admin reports: overview for admin; RBAC for everyone else', async () => {
  const { GET } = await import('../app/api/admin/reports/route');

  __setTestSession(null);
  const anon = await GET(new NextRequest('http://localhost/api/admin/reports'));
  assert.equal(anon.status, 401);

  __setTestSession(STU1);
  const asStudent = await GET(new NextRequest('http://localhost/api/admin/reports'));
  assert.equal(asStudent.status, 403);

  __setTestSession(INST1);
  const asInstructor = await GET(new NextRequest('http://localhost/api/admin/reports'));
  assert.equal(asInstructor.status, 403);

  __setTestSession(ADMIN);
  const ok = await GET(new NextRequest('http://localhost/api/admin/reports'));
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.totalEnrollments, 3);
  assert.equal(body.totalRevenue, 8000);
});

test('admin reports: per-course and per-student reports, 404s, bad dates', async () => {
  const { GET } = await import('../app/api/admin/reports/route');
  __setTestSession(ADMIN);

  const course = await GET(new NextRequest('http://localhost/api/admin/reports?courseId=course-1'));
  assert.equal(course.status, 200);
  const courseBody = await course.json();
  assert.equal(courseBody.enrollments, 2);
  assert.equal(courseBody.revenue, 8000);

  const student = await GET(new NextRequest('http://localhost/api/admin/reports?studentId=stu-1'));
  assert.equal(student.status, 200);
  const studentBody = await student.json();
  assert.equal(studentBody.enrollments, 2);
  assert.equal(studentBody.totalAmountPaid, 5000);

  const noCourse = await GET(new NextRequest('http://localhost/api/admin/reports?courseId=ghost'));
  assert.equal(noCourse.status, 404);

  const noStudent = await GET(new NextRequest('http://localhost/api/admin/reports?studentId=ghost'));
  assert.equal(noStudent.status, 404);

  const badDate = await GET(new NextRequest('http://localhost/api/admin/reports?from=banana'));
  assert.equal(badDate.status, 400);

  const reversed = await GET(new NextRequest('http://localhost/api/admin/reports?from=2024-06-01&to=2024-05-01'));
  assert.equal(reversed.status, 400);
});

// ---------------------------------------------------------------------------
// GET /api/instructor/reports
// ---------------------------------------------------------------------------

test('instructor reports: own courses only; admins and students get 403', async () => {
  const { GET } = await import('../app/api/instructor/reports/route');

  __setTestSession(null);
  const anon = await GET(new NextRequest('http://localhost/api/instructor/reports'));
  assert.equal(anon.status, 401);

  __setTestSession(ADMIN);
  const asAdmin = await GET(new NextRequest('http://localhost/api/instructor/reports'));
  assert.equal(asAdmin.status, 403);

  __setTestSession(STU1);
  const asStudent = await GET(new NextRequest('http://localhost/api/instructor/reports'));
  assert.equal(asStudent.status, 403);

  __setTestSession(INST1);
  const own = await GET(new NextRequest('http://localhost/api/instructor/reports'));
  assert.equal(own.status, 200);
  const ownBody = await own.json();
  assert.deepEqual(
    ownBody.courses.map((c: { courseId: string }) => c.courseId),
    ['course-1'],
  );
  assert.equal(ownBody.enrollments, 2);
  assert.equal(ownBody.revenue, 8000);

  __setTestSession(INST2);
  const other = await GET(new NextRequest('http://localhost/api/instructor/reports'));
  assert.equal(other.status, 200);
  const otherBody = await other.json();
  assert.deepEqual(
    otherBody.courses.map((c: { courseId: string }) => c.courseId),
    ['course-2'],
  );
  assert.equal(otherBody.enrollments, 1);

  const badDate = await GET(new NextRequest('http://localhost/api/instructor/reports?from=2024-02-30'));
  assert.equal(badDate.status, 400);
});

// ---------------------------------------------------------------------------
// GET /api/admin/reports/export
// ---------------------------------------------------------------------------

test('export: CSV download with header row, escaping, and RBAC', async () => {
  const { GET } = await import('../app/api/admin/reports/export/route');

  __setTestSession(STU1);
  const asStudent = await GET(new NextRequest('http://localhost/api/admin/reports/export?type=courses'));
  assert.equal(asStudent.status, 403);

  __setTestSession(INST1);
  const asInstructor = await GET(new NextRequest('http://localhost/api/admin/reports/export?type=courses'));
  assert.equal(asInstructor.status, 403);

  __setTestSession(ADMIN);
  const badType = await GET(new NextRequest('http://localhost/api/admin/reports/export?type=nope'));
  assert.equal(badType.status, 400);

  const badDate = await GET(new NextRequest('http://localhost/api/admin/reports/export?type=courses&from=xx'));
  assert.equal(badDate.status, 400);

  const courses = await GET(new NextRequest('http://localhost/api/admin/reports/export?type=courses'));
  assert.equal(courses.status, 200);
  assert.match(courses.headers.get('Content-Type') ?? '', /text\/csv/);
  assert.match(courses.headers.get('Content-Disposition') ?? '', /attachment; filename="codebettle-courses-\d{4}-\d{2}-\d{2}\.csv"/);
  const coursesCsv = await courses.text();
  const coursesLines = coursesCsv.split('\n');
  assert.equal(coursesLines[0], 'Course,Slug,Category,Level,Status,Price (PKR),Enrollments,Completions,Revenue (PKR)');
  // The comma-and-quote title must be quoted with doubled internal quotes.
  assert.ok(coursesLines.some((line) => line.startsWith('"Data, ""Science"" 101",')));
  assert.equal(coursesLines.length, 3); // header + 2 courses

  const enrollments = await GET(new NextRequest('http://localhost/api/admin/reports/export?type=enrollments&from=2024-05-01&to=2024-05-31'));
  assert.equal(enrollments.status, 200);
  const enrollmentsCsv = await enrollments.text();
  const enrollmentLines = enrollmentsCsv.split('\n');
  assert.equal(enrollmentLines[0], 'Student,Email,Course,Enrolled Date,Completed,Completed Date,Payment Status,Amount Paid (PKR),Coupon');
  // Only the two May enrolments — the April one is out of range.
  assert.equal(enrollmentLines.length, 3);
  assert.ok(enrollmentLines.some((line) => line.includes('Ali,ali@example.com,Web 101')));

  const students = await GET(new NextRequest('http://localhost/api/admin/reports/export?type=students'));
  assert.equal(students.status, 200);
  assert.ok((await students.text()).startsWith('Name,Email,Role,Status,Joined,Enrolled Courses'));

  const revenue = await GET(new NextRequest('http://localhost/api/admin/reports/export?type=revenue'));
  assert.equal(revenue.status, 200);
  assert.ok((await revenue.text()).startsWith('Course,Category,Enrollments,Completions,Revenue (PKR)'));
});
