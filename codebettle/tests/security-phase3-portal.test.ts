/**
 * Security Phase 3 — student portal negative tests (S-1, S-2, S-3, S-4, P-5).
 *
 * Each test proves the hole from the Phase 2 audit is closed, and that
 * the deliberate 2-lesson preview still works (a pending student can
 * still mark lessons 1–2 complete). Runs on the fake db.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { markLessonComplete, unmarkLessonComplete } from '../lib/db/enrollments';
import { createReviewService, deleteReviewService, updateReviewService } from '../lib/services/review-service';
import {
  getAttemptForStudent,
  listMyAttempts,
  startAttempt,
  submitAttempt,
  createQuizForTeacher,
  publishQuiz,
  saveQuizQuestions,
} from '../lib/services/quiz-service';
import { GET as getContent } from '../app/api/student/courses/[id]/content/route';
import { POST as postProgress } from '../app/api/student/courses/[id]/progress/route';
import { POST as createNoteRoute } from '../app/api/student/notes/route';
import { PATCH as updateNoteRoute } from '../app/api/student/notes/[id]/route';
import { POST as createReviewRoute } from '../app/api/student/reviews/route';
import type { SessionUser } from '../lib/services/auth-service';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);
const T0 = D('2026-01-10T10:00:00.000Z');

const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };
const STU2: SessionUser = { id: 'stu-2', name: 'Sara', email: 'sara@example.com', role: 'student' };
const STU1_ACTOR: Actor = { id: 'stu-1', role: 'student', name: 'Ali' };
const STU2_ACTOR: Actor = { id: 'stu-2', role: 'student', name: 'Sara' };
const INST1: Actor = { id: 'inst-1', role: 'instructor', name: 'Usman' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function course(id: string, slug: string) {
  return {
    id, slug, title: slug, description: 'Intro', longDescription: 'Long',
    thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
    instructorId: 'inst-1', zoomLink: 'https://zoom.us/j/123456789', urlKey: 'a'.repeat(48),
    schedule: null, status: 'published',
    isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
    tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
    createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
  };
}

const QUESTIONS = [
  {
    type: 'mcq' as const,
    prompt: 'What is 2 + 2?',
    points: 2,
    options: [
      { text: '3', isCorrect: false },
      { text: '4', isCorrect: true },
      { text: '5', isCorrect: false },
    ],
  },
];

async function makePublishedQuiz(courseId = 'course-1') {
  const created = await createQuizForTeacher(INST1, {
    courseId, title: 'Week 1 Quiz', timeLimitMin: 30, attemptsAllowed: 2, passMark: 50,
  });
  assert.ok('quiz' in created, JSON.stringify(created));
  const saved = await saveQuizQuestions(INST1, created.quiz.id, QUESTIONS);
  assert.ok('quiz' in saved, JSON.stringify(saved));
  const published = await publishQuiz(INST1, created.quiz.id);
  assert.ok('quiz' in published, JSON.stringify(published));
  return published.quiz;
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
  fake.seed('Course', [course('course-1', 'web-101'), course('course-2', 'py-101')]);
  fake.seed('Module', [
    { id: 'mod-1', courseId: 'course-1', title: 'Basics', position: 1 },
    { id: 'mod-2', courseId: 'course-1', title: 'Advanced', position: 2 },
    { id: 'mod-9', courseId: 'course-2', title: 'Other', position: 1 },
  ]);
  fake.seed('Lesson', [
    { id: 'les-1', moduleId: 'mod-1', title: 'Intro', position: 1, recordingUrl: 'https://www.youtube.com/watch?v=example' },
    { id: 'les-2', moduleId: 'mod-1', title: 'Variables', position: 2, recordingUrl: 'https://drive.example.com/real-recording-2' },
    { id: 'les-3', moduleId: 'mod-2', title: 'Functions', position: 1, recordingUrl: 'https://drive.example.com/real-recording-3' },
    { id: 'les-4', moduleId: 'mod-2', title: 'Classes', position: 2, recordingUrl: 'https://drive.example.com/real-recording-4' },
    { id: 'les-other', moduleId: 'mod-9', title: 'Other lesson', position: 1 },
  ]);
  fake.seed('Enrollment', [
    // stu-1: PENDING in course-1 (the audit's exact scenario).
    { id: 'enr-pending', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'pending', amountPaid: 0, couponUsed: null, deletedAt: null },
    // stu-2: PAID in course-1.
    { id: 'enr-paid', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
  fake.seed('Note', [
    { id: 'note-1', userId: 'stu-1', title: 'Hooks', content: 'useState', courseId: 'course-1', createdAt: D('2024-05-01'), updatedAt: D('2024-05-01') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ── S-1: progress gate ──────────────────────────────────────────────────────

test('S-1: a pending student cannot mark locked lesson 3 complete, but lesson 1 still works', async () => {
  __setTestSession(STU1);
  const params = { params: Promise.resolve({ id: 'course-1' }) };
  const locked = await postProgress(
    jsonReq('http://x/api/student/courses/course-1/progress', 'POST', { lessonId: 'les-3', completed: true }),
    params,
  );
  assert.equal(locked.status, 403);
  const lockedBody = (await locked.json()) as { error: string };
  assert.match(lockedBody.error, /locked until your payment is verified/);

  const preview = await postProgress(
    jsonReq('http://x/api/student/courses/course-1/progress', 'POST', { lessonId: 'les-1', completed: true }),
    params,
  );
  assert.equal(preview.status, 200);
  const previewBody = (await preview.json()) as { completedLessonIds: string[]; percent: number };
  assert.deepEqual(previewBody.completedLessonIds, ['les-1']);
  assert.equal(previewBody.percent, 25);

  // Lesson 2 (the second preview lesson) is markable too.
  const preview2 = await postProgress(
    jsonReq('http://x/api/student/courses/course-1/progress', 'POST', { lessonId: 'les-2', completed: true }),
    params,
  );
  assert.equal(preview2.status, 200);
});

test('S-1: a paid student can mark lesson 3 complete', async () => {
  __setTestSession(STU2);
  const params = { params: Promise.resolve({ id: 'course-1' }) };
  const res = await postProgress(
    jsonReq('http://x/api/student/courses/course-1/progress', 'POST', { lessonId: 'les-3', completed: true }),
    params,
  );
  assert.equal(res.status, 200);
});

test('S-1 (defense in depth): mark/unmark in the repo reject a wrong student or a lesson from another course', async () => {
  assert.deepEqual(await markLessonComplete('enr-pending', 'les-1', { studentId: 'stu-2', courseId: 'course-1' }), {
    error: 'Enrollment does not belong to this student',
  });
  assert.deepEqual(await markLessonComplete('enr-pending', 'les-other', { studentId: 'stu-1', courseId: 'course-1' }), {
    error: 'Lesson does not belong to this course',
  });
  assert.deepEqual(await unmarkLessonComplete('enr-pending', 'les-1', { studentId: 'stu-2', courseId: 'course-1' }), {
    error: 'Enrollment does not belong to this student',
  });
  // The plain (no-opts) call still enforces lesson/course ownership.
  assert.deepEqual(await markLessonComplete('enr-pending', 'les-other'), {
    error: 'Lesson does not belong to this course',
  });
});

// ── S-2: review responses must not leak zoomLink / urlKey ───────────────────

test('S-2: review create/update/delete responses contain no zoomLink or urlKey', async () => {
  // stu-2 is paid in course-1, so they may review it.
  const created = await createReviewService(STU2, { courseId: 'course-1', rating: 5, comment: 'Excellent!' });
  assert.ok('review' in created, JSON.stringify(created));
  assert.ok(created.course, 'expected a course in the response');
  assert.equal('zoomLink' in created.course, false);
  assert.equal('urlKey' in created.course, false);
  assert.equal(JSON.stringify(created.course).includes('zoom.us'), false);
  assert.equal(JSON.stringify(created.course).includes('a'.repeat(48)), false);
  // Rating stats are still present — that is what the client needs.
  assert.equal(typeof created.course.rating, 'number');

  const updated = await updateReviewService(STU2, created.review.id, { rating: 4 });
  assert.ok('review' in updated, JSON.stringify(updated));
  assert.ok(updated.course);
  assert.equal('zoomLink' in updated.course, false);
  assert.equal('urlKey' in updated.course, false);

  const deleted = await deleteReviewService(STU2, created.review.id);
  assert.ok('success' in deleted, JSON.stringify(deleted));
  assert.ok(deleted.course);
  assert.equal('zoomLink' in deleted.course, false);
  assert.equal('urlKey' in deleted.course, false);
});

test('S-2 (route): POST /api/student/reviews raw JSON carries no zoomLink or urlKey', async () => {
  __setTestSession(STU2);
  const res = await createReviewRoute(jsonReq('http://localhost/api/student/reviews', 'POST', {
    courseId: 'course-1', rating: 5, comment: 'Great course',
  }));
  assert.equal(res.status, 201);
  const raw = await res.text();
  assert.equal(raw.includes('zoomLink'), false, raw);
  assert.equal(raw.includes('urlKey'), false, raw);
  assert.equal(raw.includes('zoom.us'), false, raw);
});

// ── S-3: notes need an enrolment ────────────────────────────────────────────

test('S-3: note create for an unenrolled course is 403; enrolled course works', async () => {
  __setTestSession(STU1); // enrolled in course-1 only
  const blocked = await createNoteRoute(jsonReq('http://localhost/api/student/notes', 'POST', {
    title: 'x', content: 'y', courseId: 'course-2',
  }));
  assert.equal(blocked.status, 403);

  const ok = await createNoteRoute(jsonReq('http://localhost/api/student/notes', 'POST', {
    title: 'x', content: 'y', courseId: 'course-1',
  }));
  assert.equal(ok.status, 201);

  // No course at all is still fine (a free-floating private note).
  const free = await createNoteRoute(jsonReq('http://localhost/api/student/notes', 'POST', {
    title: 'x', content: 'y',
  }));
  assert.equal(free.status, 201);
});

test('S-3: note update to an unenrolled course is 403; unlinking stays allowed', async () => {
  __setTestSession(STU1);
  const blocked = await updateNoteRoute(
    jsonReq('http://localhost/api/student/notes/note-1', 'PATCH', { courseId: 'course-2' }),
    { params: Promise.resolve({ id: 'note-1' }) },
  );
  assert.equal(blocked.status, 403);

  const unlinked = await updateNoteRoute(
    jsonReq('http://localhost/api/student/notes/note-1', 'PATCH', { courseId: null }),
    { params: Promise.resolve({ id: 'note-1' }) },
  );
  assert.equal(unlinked.status, 200);
});

// ── S-4: quiz attempt quiz-id binding + list gate ───────────────────────────

test('S-4: fetching or submitting an attempt under the wrong quiz id is rejected', async () => {
  const quizA = await makePublishedQuiz('course-1');
  const quizB = await makePublishedQuiz('course-1');
  const started = await startAttempt(STU2_ACTOR, quizA.id, T0);
  assert.ok('attempt' in started, JSON.stringify(started));
  const attemptId = started.attempt.id;

  const wrongGet = await getAttemptForStudent(STU2_ACTOR, attemptId, T0, quizB.id);
  assert.ok('error' in wrongGet, JSON.stringify(wrongGet));
  assert.equal(wrongGet.status, 403);

  const rightGet = await getAttemptForStudent(STU2_ACTOR, attemptId, T0, quizA.id);
  assert.ok('attempt' in rightGet, JSON.stringify(rightGet));

  const wrongSubmit = await submitAttempt(STU2_ACTOR, attemptId, [], T0, quizB.id);
  assert.ok('error' in wrongSubmit, JSON.stringify(wrongSubmit));
  assert.equal(wrongSubmit.status, 403);

  // The attempt is still in progress after the rejected submit.
  const stillThere = await getAttemptForStudent(STU2_ACTOR, attemptId, T0, quizA.id);
  assert.ok('attempt' in stillThere, JSON.stringify(stillThere));
  assert.equal(stillThere.attempt.status, 'in_progress');
});

test('S-4: listMyAttempts while pending is forbidden; paid students can list', async () => {
  const quiz = await makePublishedQuiz('course-1');
  const pending = await listMyAttempts(STU1_ACTOR, quiz.id);
  assert.ok('error' in pending, JSON.stringify(pending));
  assert.equal(pending.status, 403);

  const paid = await listMyAttempts(STU2_ACTOR, quiz.id);
  assert.ok('attempts' in paid, JSON.stringify(paid));
  assert.deepEqual(paid.attempts, []);

  // After starting, the paid student's attempt is listed.
  const started = await startAttempt(STU2_ACTOR, quiz.id, T0);
  assert.ok('attempt' in started, JSON.stringify(started));
  const listed = await listMyAttempts(STU2_ACTOR, quiz.id);
  assert.ok('attempts' in listed, JSON.stringify(listed));
  assert.equal(listed.attempts.length, 1);
});

test('S-4: listMyAttempts for a course the student is not enrolled in is forbidden', async () => {
  const quiz = await makePublishedQuiz('course-2');
  const res = await listMyAttempts(STU1_ACTOR, quiz.id);
  assert.ok('error' in res, JSON.stringify(res));
  assert.equal(res.status, 403);
});

// ── P-5: placeholder recording URLs + accessible-only count ─────────────────

test('P-5: the content endpoint blanks the placeholder recording URL but keeps real ones', async () => {
  __setTestSession(STU1); // pending: lessons 1–2 unlocked, 3–4 locked
  const params = { params: Promise.resolve({ id: 'course-1' }) };
  const res = await getContent(new NextRequest('http://x/api/student/courses/course-1/content'), params);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    lessons: Array<{ lessonId: string; recordingUrl: string; locked: boolean }>;
  };
  const byId = new Map(body.lessons.map((l) => [l.lessonId, l]));
  // Lesson 1 is unlocked but its stored URL is the seed placeholder —
  // it must come back blank, never as a watch?v=example link.
  assert.equal(byId.get('les-1')?.locked, false);
  assert.equal(byId.get('les-1')?.recordingUrl, '');
  // Lesson 2 is unlocked with a real URL — untouched.
  assert.equal(byId.get('les-2')?.recordingUrl, 'https://drive.example.com/real-recording-2');
  // Lesson 3 is locked — no URL at all.
  assert.equal(byId.get('les-3')?.locked, true);
  assert.equal(byId.get('les-3')?.recordingUrl, '');
  assert.equal(JSON.stringify(body).includes('watch?v=example'), false);
});

test('P-5: the student course page counts only accessible, real recordings', async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const page = readFileSync(join(root, 'app/student/courses/[id]/page.tsx'), 'utf8');
  // Pending students only count the first-2 preview lessons…
  assert.match(page, /index >= 2/);
  // …and placeholder URLs are never counted as recordings.
  assert.match(page, /watch\?v=example/);
  // The old count-everything line must be gone.
  assert.doesNotMatch(page, /filter\(l => l\.driveRecordingUrl\)/);
});
