import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { setCertificateEligibility } from '../lib/services/enrollment-service';
import { createCourseService, updateCourseService } from '../lib/services/course-service';
import { applicationCreateSchema, blogCreateSchema, courseCreateSchema } from '../lib/api-schemas';
import { PATCH as patchInstructorEnrollment } from '../app/api/instructor/enrollments/[id]/route';
import type { SessionUser } from '../lib/services/auth-service';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };
const INST1: Actor = { id: 'inst-1', role: 'instructor', name: 'Usman' };
const INST2: Actor = { id: 'inst-2', role: 'instructor', name: 'Sara' };
const STU: Actor = { id: 'stu-1', role: 'student', name: 'Ali' };

const ADMIN_SESS: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const INST1_SESS: SessionUser = { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', role: 'instructor' };
const INST2_SESS: SessionUser = { id: 'inst-2', name: 'Sara', email: 'sara@codebettle.com', role: 'instructor' };
const STU_SESS: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-2', name: 'Sara', email: 'sara@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: 'Long',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 1, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
    {
      id: 'course-2', slug: 'other-101', title: 'Other 101', description: 'Other', longDescription: 'Other',
      thumbnail: '/t.png', category: 'Programming', level: 'beginner', pricePkr: 0, isFree: true,
      instructorId: 'inst-2', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: true, completedAt: D('2024-06-01'), paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-1', courseId: 'course-2', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

test('instructor sets eligibility for own course students; others are denied', async () => {
  const ok = await setCertificateEligibility(INST1, 'enr-1', true);
  assert.ok('enrollment' in ok, JSON.stringify(ok));
  assert.equal(ok.enrollment.certificateEligible, true);

  const cleared = await setCertificateEligibility(INST1, 'enr-1', false);
  assert.ok('enrollment' in cleared, JSON.stringify(cleared));
  assert.equal(cleared.enrollment.certificateEligible, false);

  const otherCourse = await setCertificateEligibility(INST1, 'enr-2', true);
  assert.ok('error' in otherCourse && otherCourse.status === 403, JSON.stringify(otherCourse));

  const asStudent = await setCertificateEligibility(STU, 'enr-1', true);
  assert.ok('error' in asStudent && asStudent.status === 403, JSON.stringify(asStudent));

  const asAdmin = await setCertificateEligibility(ADMIN, 'enr-1', true);
  assert.ok('error' in asAdmin && asAdmin.status === 403, JSON.stringify(asAdmin));

  const missing = await setCertificateEligibility(INST1, 'ghost', true);
  assert.ok('error' in missing && missing.status === 404, JSON.stringify(missing));
});

test('PATCH /api/instructor/enrollments/[id]: ownership enforced at the route', async () => {
  __setTestSession(INST1_SESS);
  const ok = await patchInstructorEnrollment(
    jsonReq('http://x/api/instructor/enrollments/enr-1', 'PATCH', { certificateEligible: true }),
    { params: Promise.resolve({ id: 'enr-1' }) },
  );
  assert.equal(ok.status, 200);

  __setTestSession(INST2_SESS);
  const notOwner = await patchInstructorEnrollment(
    jsonReq('http://x/api/instructor/enrollments/enr-1', 'PATCH', { certificateEligible: true }),
    { params: Promise.resolve({ id: 'enr-1' }) },
  );
  assert.equal(notOwner.status, 403);

  __setTestSession(STU_SESS);
  const asStudent = await patchInstructorEnrollment(
    jsonReq('http://x/api/instructor/enrollments/enr-1', 'PATCH', { certificateEligible: true }),
    { params: Promise.resolve({ id: 'enr-1' }) },
  );
  assert.equal(asStudent.status, 403);

  __setTestSession(ADMIN_SESS);
  const asAdmin = await patchInstructorEnrollment(
    jsonReq('http://x/api/instructor/enrollments/enr-1', 'PATCH', { certificateEligible: true }),
    { params: Promise.resolve({ id: 'enr-1' }) },
  );
  assert.equal(asAdmin.status, 403);

  __setTestSession(INST1_SESS);
  const badBody = await patchInstructorEnrollment(
    jsonReq('http://x/api/instructor/enrollments/enr-1', 'PATCH', {}),
    { params: Promise.resolve({ id: 'enr-1' }) },
  );
  assert.equal(badBody.status, 400);
});

test('application create schema keeps the message field', () => {
  // Module 3: LinkedIn/CV/demo/whyGoodFit are required now, so the
  // parses below carry them; what this test pins is that `message`
  // itself is optional and round-trips when present.
  const required = {
    linkedinUrl: 'https://linkedin.com/in/rahim',
    cvUrl: 'cvs/11111111-1111-1111-1111-111111111111.pdf',
    demoRecordingUrl: 'demos/22222222-2222-2222-2222-222222222222.mp4',
    whyGoodFit: 'I love teaching.',
  };
  const parsed = applicationCreateSchema.safeParse({
    name: 'Rahim', email: 'rahim@example.com', expertise: 'React', experience: '5y',
    message: 'I want to teach.', ...required,
  });
  assert.ok(parsed.success, JSON.stringify(parsed.error));
  assert.equal(parsed.data.message, 'I want to teach.');

  const noMessage = applicationCreateSchema.safeParse({ name: 'Rahim', email: 'rahim@example.com', ...required });
  assert.ok(noMessage.success);
  assert.equal(noMessage.data.message, undefined);
});

test('blog create schema allows a PDF-only post but not an empty post', () => {
  const base = {
    slug: 'x', title: 'T', excerpt: 'E', thumbnail: '/t.png', category: 'React', readTime: '5 min read',
  };
  assert.ok(blogCreateSchema.safeParse({ ...base, content: '', pdfUrl: 'https://x/blog-pdfs/blogs/a.pdf' }).success);
  assert.ok(!blogCreateSchema.safeParse({ ...base, content: '' }).success);
  assert.ok(!blogCreateSchema.safeParse({ ...base, content: '   ' }).success);
  assert.ok(blogCreateSchema.safeParse({ ...base, content: '<p>Hello</p>' }).success);
});

test('course schedule round-trips through create and update', async () => {
  const schedule = {
    classTime: '19:00', classDuration: '1.5 hours', scheduleType: 'weekdays' as const,
    startDate: '2024-06-01', notes: 'Holidays excluded',
  };
  const created = await createCourseService(ADMIN, {
    slug: 'sched-101', title: 'Sched 101', description: 'D', longDescription: 'L',
    thumbnail: '/t.png', category: 'Web Development', level: 'beginner', price: 1000,
    instructorId: 'inst-1', schedule,
  });
  assert.ok('course' in created, JSON.stringify(created));
  assert.equal(created.course.schedule?.classTime, '19:00');
  assert.equal(created.course.schedule?.scheduleType, 'weekdays');
  assert.equal(created.course.schedule?.startDate, '2024-06-01');

  const updated = await updateCourseService(ADMIN, 'course-1', {
    schedule: { ...schedule, classTime: '20:00', scheduleType: 'weekends' as const },
  });
  assert.ok('course' in updated, JSON.stringify(updated));
  assert.equal(updated.course.schedule?.classTime, '20:00');
  assert.equal(updated.course.schedule?.scheduleType, 'weekends');

  const parsed = courseCreateSchema.safeParse({
    slug: 's', title: 'T', description: 'D', longDescription: 'L', thumbnail: '/t.png',
    category: 'Web Development', level: 'beginner', price: 0, schedule,
  });
  assert.ok(parsed.success, JSON.stringify(parsed.error));
});
