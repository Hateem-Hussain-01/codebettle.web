import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { toPublicCourse } from '../lib/db/mappers';
import { getCourseBySlug } from '../lib/db/courses';
import type { Course } from '../lib/db/types';
import type { SessionUser } from '../lib/services/auth-service';
import { GET as listCourses } from '../app/api/courses/route';
import { GET as getCourseBySlugRoute } from '../app/api/courses/[slug]/route';
import { GET as getContent } from '../app/api/student/courses/[id]/content/route';

/**
 * Phase 0a — recording leak regression tests.
 *
 * The public course payload used to ship every lesson's Drive recording
 * URL and materials URLs (and only the Zoom link was stripped). Drive
 * URLs are bearer links: anyone with the URL can open the recording, so
 * they must never appear in a public payload. The public catalogue and
 * course-detail APIs (and every public page, which all go through
 * toPublicCourse) must carry lesson titles only — no recording URL, no
 * materials URL, no Zoom link. Enrolled students with a confirmed
 * payment get the gated content from GET /api/student/courses/[id]/content,
 * which checks the session, the enrolment and paymentStatus in
 * { paid, free }.
 */

const D = (s: string) => new Date(s);
const ZOOM = 'https://zoom.us/j/1234567890';
const REC = 'https://drive.google.com/file/d/REC123/view';
const MAT = 'https://drive.google.com/file/d/MAT456/view';

const STU_PAID: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };
const STU_PENDING: SessionUser = { id: 'stu-2', name: 'Sara', email: 'sara@example.com', role: 'student' };
const STU_FREE: SessionUser = { id: 'stu-3', name: 'Omar', email: 'omar@example.com', role: 'student' };
const STU_NONE: SessionUser = { id: 'stu-4', name: 'Noor', email: 'noor@example.com', role: 'student' };
const INST1: SessionUser = { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', role: 'instructor' };

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-3', name: 'Omar', email: 'omar@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-4', name: 'Noor', email: 'noor@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: 'Long',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: ZOOM, schedule: null, status: 'published',
      isFeatured: true, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 3, rating: 4.5, reviewCount: 2,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Module', [
    { id: 'mod-1', courseId: 'course-1', title: 'Basics', position: 1 },
  ]);
  fake.seed('Lesson', [
    { id: 'les-1', moduleId: 'mod-1', title: 'L1', description: 'First', position: 1, recordingUrl: REC, materials: [{ name: 'Slides', url: MAT }], duration: '10m', date: null },
    { id: 'les-2', moduleId: 'mod-1', title: 'L2', description: 'Second', position: 2, recordingUrl: null, materials: [], duration: '20m', date: null },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'pending', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-3', studentId: 'stu-3', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

function contentReq(courseId: string): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://localhost/api/student/courses/${courseId}/content`),
    { params: Promise.resolve({ id: courseId }) },
  ];
}

test('toPublicCourse strips recording URLs, materials URLs and Zoom — and does not mutate the original', () => {
  const course: Course = {
    id: 'c1', slug: 's', title: 'T', description: 'd', longDescription: 'ld',
    thumbnail: '/t.png', category: 'Web Development', level: 'beginner', price: 5000,
    isFree: false, instructorId: 'inst-1', zoomLink: ZOOM, status: 'published',
    isFeatured: false, isCompleted: false,
    modules: [{
      id: 'm1', title: 'Basics', lessons: [{
        id: 'l1', title: 'L1', description: 'First', date: '', driveRecordingUrl: REC,
        materials: [{ name: 'Slides', url: MAT }], duration: '10m',
      }],
    }],
    requirements: [], whatYouLearn: [], tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
  };
  const pub = toPublicCourse(course);
  assert.equal('zoomLink' in pub, false);
  assert.equal(pub.modules[0].lessons[0].driveRecordingUrl, '');
  assert.deepEqual(pub.modules[0].lessons[0].materials, []);
  // The curriculum itself stays public — only the bearer links are gone.
  assert.equal(pub.modules[0].lessons[0].title, 'L1');
  assert.equal(JSON.stringify(pub).includes('drive.google.com'), false);
  assert.equal(JSON.stringify(pub).includes('zoom.us'), false);
  // The original is untouched — stripping must not mutate the stored course.
  assert.equal(course.zoomLink, ZOOM);
  assert.equal(course.modules[0].lessons[0].driveRecordingUrl, REC);
  assert.deepEqual(course.modules[0].lessons[0].materials, [{ name: 'Slides', url: MAT }]);
});

test('the stored course really has the recording, materials and Zoom URLs (guard against a vacuous test)', async () => {
  const stored = await getCourseBySlug('web-101');
  assert.ok(stored);
  assert.equal(stored.zoomLink, ZOOM);
  assert.equal(stored.modules[0].lessons[0].driveRecordingUrl, REC);
  assert.deepEqual(stored.modules[0].lessons[0].materials, [{ name: 'Slides', url: MAT }]);
});

test('GET /api/courses never returns recording URLs, materials URLs or Zoom links', async () => {
  const res = await listCourses(new NextRequest('http://localhost/api/courses'));
  assert.equal(res.status, 200);
  const body = await res.json() as { items: Record<string, unknown>[] };
  assert.equal(body.items.length, 1);
  const text = JSON.stringify(body);
  assert.equal(text.includes('drive.google.com'), false);
  assert.equal(text.includes('zoom.us'), false);
  assert.equal(text.includes('REC123'), false);
  assert.equal(text.includes('MAT456'), false);
  const lesson = (body.items[0] as { modules: { lessons: { driveRecordingUrl: string; materials: unknown[] }[] }[] }).modules[0].lessons[0];
  assert.equal(lesson.driveRecordingUrl, '');
  assert.deepEqual(lesson.materials, []);
});

test('GET /api/courses/[slug] never returns recording URLs, materials URLs or Zoom links', async () => {
  const res = await getCourseBySlugRoute(new NextRequest('http://localhost/api/courses/web-101'), { params: Promise.resolve({ slug: 'web-101' }) });
  assert.equal(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  const text = JSON.stringify(body);
  assert.equal(text.includes('drive.google.com'), false);
  assert.equal(text.includes('zoom.us'), false);
  assert.equal(text.includes('REC123'), false);
  assert.equal(text.includes('MAT456'), false);
  assert.equal('zoomLink' in body, false);
});

test('content endpoint refuses unauthenticated users and non-students', async () => {
  __setTestSession(null);
  const [anonReq, anonParams] = contentReq('course-1');
  assert.equal((await getContent(anonReq, anonParams)).status, 401);
  __setTestSession(INST1);
  const [instReq, instParams] = contentReq('course-1');
  assert.equal((await getContent(instReq, instParams)).status, 403);
});

test('content endpoint refuses a student who is not enrolled', async () => {
  __setTestSession(STU_NONE);
  const [req, params] = contentReq('course-1');
  const res = await getContent(req, params);
  assert.equal(res.status, 404);
  const text = JSON.stringify(await res.json());
  assert.equal(text.includes('drive.google.com'), false);
});

test('content endpoint gives a pending-payment enrolment only the first 2 lessons (Phase 1d)', async () => {
  __setTestSession(STU_PENDING);
  const [req, params] = contentReq('course-1');
  const res = await getContent(req, params);
  // No longer a 403: the first 2 introductory lessons are watchable
  // before verification; the rest stay locked and the Zoom link is withheld.
  assert.equal(res.status, 200);
  const body = await res.json() as {
    paymentStatus: string; zoomLink: string;
    lessons: { lessonId: string; recordingUrl: string; materials: { name: string; url: string }[]; locked: boolean }[];
  };
  assert.equal(body.paymentStatus, 'pending');
  assert.equal(body.zoomLink, '');
  assert.equal(body.lessons.length, 2);
  assert.equal(body.lessons[0].locked, false);
  assert.equal(body.lessons[0].recordingUrl, REC);
  assert.deepEqual(body.lessons[0].materials, [{ name: 'Slides', url: MAT }]);
  assert.equal(body.lessons[1].locked, false);
  assert.equal(body.lessons[1].recordingUrl, '');
});

test('content endpoint returns Zoom, recordings and materials to a paid enrolment', async () => {
  __setTestSession(STU_PAID);
  const [req, params] = contentReq('course-1');
  const res = await getContent(req, params);
  assert.equal(res.status, 200);
  const body = await res.json() as {
    courseId: string; zoomLink: string;
    lessons: { lessonId: string; recordingUrl: string; materials: { name: string; url: string }[] }[];
  };
  assert.equal(body.courseId, 'course-1');
  assert.equal(body.zoomLink, ZOOM);
  assert.equal(body.lessons.length, 2);
  assert.equal(body.lessons[0].lessonId, 'les-1');
  assert.equal(body.lessons[0].recordingUrl, REC);
  assert.deepEqual(body.lessons[0].materials, [{ name: 'Slides', url: MAT }]);
  assert.equal(body.lessons[1].recordingUrl, '');
});

test('content endpoint returns gated content to a free enrolment, and 404s for an unknown course', async () => {
  __setTestSession(STU_FREE);
  const [req, params] = contentReq('course-1');
  const res = await getContent(req, params);
  assert.equal(res.status, 200);
  const body = await res.json() as { zoomLink: string };
  assert.equal(body.zoomLink, ZOOM);

  const [missingReq, missingParams] = contentReq('nope');
  assert.equal((await getContent(missingReq, missingParams)).status, 404);
});
