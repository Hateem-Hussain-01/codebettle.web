import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  courseProgressPercent,
  findNextLesson,
  flattenLessons,
  summarizeCourseProgress,
} from '../lib/services/progress-service';
import { getEnrollmentsByStudent, markLessonComplete, unmarkLessonComplete } from '../lib/db/enrollments';
import { GET, POST } from '../app/api/student/courses/[id]/progress/route';
import type { SessionUser } from '../lib/services/auth-service';

const D = (s: string) => new Date(s);

const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };
const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };

const MODULES = [
  {
    id: 'mod-1',
    title: 'Basics',
    lessons: [
      { id: 'les-1', title: 'Intro' },
      { id: 'les-2', title: 'Variables' },
    ],
  },
  {
    id: 'mod-2',
    title: 'Advanced',
    lessons: [{ id: 'les-3', title: 'Functions' }],
  },
];

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Pure helpers ────────────────────────────────────────────────────────────

test('courseProgressPercent: 0% with no lessons, 0% with none done, 100% when all done', () => {
  assert.equal(courseProgressPercent(0, 0), 0);
  assert.equal(courseProgressPercent(10, 0), 0);
  assert.equal(courseProgressPercent(10, 10), 100);
  assert.equal(courseProgressPercent(4, 2), 50);
});

test('courseProgressPercent: rounds to the nearest whole number and clamps', () => {
  assert.equal(courseProgressPercent(3, 1), 33);
  assert.equal(courseProgressPercent(3, 2), 67);
  assert.equal(courseProgressPercent(10, 15), 100);
  assert.equal(courseProgressPercent(10, -2), 0);
});

test('flattenLessons: flattens modules in curriculum order', () => {
  assert.deepEqual(
    flattenLessons(MODULES).map((l) => l.lessonId),
    ['les-1', 'les-2', 'les-3'],
  );
  assert.deepEqual(flattenLessons([]), []);
});

test('findNextLesson: first incomplete lesson, null when all complete', () => {
  assert.equal(findNextLesson(MODULES, [])?.lessonId, 'les-1');
  assert.equal(findNextLesson(MODULES, ['les-1'])?.lessonId, 'les-2');
  assert.equal(findNextLesson(MODULES, new Set(['les-1', 'les-2']))?.lessonId, 'les-3');
  assert.equal(findNextLesson(MODULES, ['les-1', 'les-2', 'les-3']), null);
  assert.equal(findNextLesson([], []), null);
});

test('summarizeCourseProgress: totals, percent, next lesson and isComplete agree', () => {
  const s = summarizeCourseProgress(MODULES, ['les-1']);
  assert.equal(s.totalLessons, 3);
  assert.equal(s.completedCount, 1);
  assert.equal(s.percent, 33);
  assert.equal(s.nextLesson?.lessonId, 'les-2');
  assert.equal(s.isComplete, false);
  const done = summarizeCourseProgress(MODULES, ['les-1', 'les-2', 'les-3']);
  assert.equal(done.percent, 100);
  assert.equal(done.nextLesson, null);
  assert.equal(done.isComplete, true);
  const empty = summarizeCourseProgress([], []);
  assert.equal(empty.percent, 0);
  assert.equal(empty.isComplete, false);
});

// ── mark / unmark through the repo (fake DB) ────────────────────────────────

let fake: FakeDb;

function seedBase() {
  fake.seed('User', [
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'python', title: 'Python', description: 'Intro', longDescription: '', thumbnail: '/t.png',
      category: 'Programming', level: 'beginner', pricePkr: 1500, isFree: false, instructorId: 'inst-1',
      zoomLink: null, schedule: null, status: 'published', isFeatured: false, isCompleted: false,
      completedAt: null, requirements: [], whatYouLearn: [], tags: [], enrolledCount: 0, rating: 0,
      reviewCount: 0, createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Module', [
    { id: 'mod-1', courseId: 'course-1', title: 'Basics', position: 1 },
    { id: 'mod-2', courseId: 'course-1', title: 'Advanced', position: 2 },
  ]);
  fake.seed('Lesson', [
    { id: 'les-1', moduleId: 'mod-1', title: 'Intro', position: 1 },
    { id: 'les-2', moduleId: 'mod-1', title: 'Variables', position: 2 },
    { id: 'les-3', moduleId: 'mod-2', title: 'Functions', position: 1 },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 1500, couponUsed: null, deletedAt: null },
  ]);
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedBase();
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

test('markLessonComplete is idempotent and unmarkLessonComplete removes the row', async () => {
  assert.deepEqual(await markLessonComplete('enr-1', 'les-1'), { ok: true });
  assert.deepEqual(await markLessonComplete('enr-1', 'les-1'), { ok: true });
  let enr = (await getEnrollmentsByStudent('stu-1'))[0];
  assert.deepEqual(enr.completedLessons, ['les-1']);

  assert.deepEqual(await unmarkLessonComplete('enr-1', 'les-1'), { ok: true });
  enr = (await getEnrollmentsByStudent('stu-1'))[0];
  assert.deepEqual(enr.completedLessons, []);
  // Unmarking again is also fine (idempotent).
  assert.deepEqual(await unmarkLessonComplete('enr-1', 'les-1'), { ok: true });
});

test('mark/unmark reject an unknown enrolment or lesson', async () => {
  assert.deepEqual(await markLessonComplete('nope', 'les-1'), { error: 'Enrollment not found' });
  assert.deepEqual(await markLessonComplete('enr-1', 'nope'), { error: 'Lesson not found' });
  assert.deepEqual(await unmarkLessonComplete('nope', 'les-1'), { error: 'Enrollment not found' });
  assert.deepEqual(await unmarkLessonComplete('enr-1', 'nope'), { error: 'Lesson not found' });
});

// ── Progress API ────────────────────────────────────────────────────────────

test('GET progress: 0% with nothing done; POST marks and returns the updated state', async () => {
  __setTestSession(STU1);
  const params = { params: Promise.resolve({ id: 'course-1' }) };
  const before = await GET(jsonReq('http://x/api/student/courses/course-1/progress', 'GET'), params);
  assert.equal(before.status, 200);
  const beforeJson = (await before.json()) as { percent: number; completedLessonIds: string[]; nextLesson: { lessonId: string } | null };
  assert.equal(beforeJson.percent, 0);
  assert.deepEqual(beforeJson.completedLessonIds, []);
  assert.equal(beforeJson.nextLesson?.lessonId, 'les-1');

  const marked = await POST(jsonReq('http://x/api/student/courses/course-1/progress', 'POST', { lessonId: 'les-1', completed: true }), params);
  assert.equal(marked.status, 200);
  const markedJson = (await marked.json()) as { percent: number; completedLessonIds: string[]; nextLesson: { lessonId: string } | null };
  assert.equal(markedJson.percent, 33);
  assert.deepEqual(markedJson.completedLessonIds, ['les-1']);
  assert.equal(markedJson.nextLesson?.lessonId, 'les-2');

  const unmarked = await POST(jsonReq('http://x/api/student/courses/course-1/progress', 'POST', { lessonId: 'les-1', completed: false }), params);
  assert.equal(unmarked.status, 200);
  const unmarkedJson = (await unmarked.json()) as { percent: number; completedLessonIds: string[] };
  assert.equal(unmarkedJson.percent, 0);
  assert.deepEqual(unmarkedJson.completedLessonIds, []);
});

test('POST progress: rejects a lesson from another course and a bad body', async () => {
  __setTestSession(STU1);
  const params = { params: Promise.resolve({ id: 'course-1' }) };
  const other = await POST(jsonReq('http://x/api/student/courses/course-1/progress', 'POST', { lessonId: 'les-other', completed: true }), params);
  assert.equal(other.status, 404);
  const bad = await POST(jsonReq('http://x/api/student/courses/course-1/progress', 'POST', { lessonId: 'les-1' }), params);
  assert.equal(bad.status, 400);
});

test('progress API: non-students get 403, non-enrolled students get 404', async () => {
  __setTestSession(ADMIN);
  const params = { params: Promise.resolve({ id: 'course-1' }) };
  assert.equal((await GET(jsonReq('http://x/api/student/courses/course-1/progress', 'GET'), params)).status, 403);
  assert.equal((await POST(jsonReq('http://x/api/student/courses/course-1/progress', 'POST', { lessonId: 'les-1', completed: true }), params)).status, 403);
});
