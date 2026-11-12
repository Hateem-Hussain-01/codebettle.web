/**
 * Quiz API tests (Phase 5) — route-level checks, including the critical
 * answer-key security test: the attempt payload a student receives must
 * never contain correct answers, in any field, at any endpoint.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { createQuizForTeacher, publishQuiz, saveQuizQuestions } from '../lib/services/quiz-service';
import type { SessionUser } from '../lib/services/auth-service';

const D = (s: string) => new Date(s);
const T0 = D('2026-01-10T10:00:00.000Z');

const INST1: SessionUser = { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', role: 'instructor' };
const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };
const STU2: SessionUser = { id: 'stu-2', name: 'Sara', email: 'sara@example.com', role: 'student' };
const ADMIN: SessionUser = { id: 'admin-1', name: 'Ahmad', email: 'admin@codebettle.com', role: 'admin' };

let fake: FakeDb;
let quizId: string;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
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
  {
    type: 'fill_blank' as const,
    prompt: 'The chemical symbol for water is ______.',
    points: 3,
    correctText: 'H2O',
    options: [],
  },
];

async function seedQuiz() {
  const created = await createQuizForTeacher(
    { id: 'inst-1', role: 'instructor', name: 'Usman' },
    { courseId: 'course-1', title: 'Week 1 Quiz', timeLimitMin: 30, attemptsAllowed: 2, passMark: 50 },
  );
  assert.ok('quiz' in created);
  const saved = await saveQuizQuestions({ id: 'inst-1', role: 'instructor', name: 'Usman' }, created.quiz.id, QUESTIONS);
  assert.ok('quiz' in saved);
  const published = await publishQuiz({ id: 'inst-1', role: 'instructor', name: 'Usman' }, created.quiz.id);
  assert.ok('quiz' in published);
  quizId = published.quiz.id;
}

test.beforeEach(async () => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'admin-1', name: 'Ahmad', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
  await seedQuiz();
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

test('ANSWER-KEY SECURITY: the start-attempt payload never contains the key', async () => {
  const { POST } = await import('../app/api/student/quizzes/[id]/start/route');
  __setTestSession(STU1);
  const res = await POST(jsonReq(`http://localhost/api/student/quizzes/${quizId}/start`, 'POST'), {
    params: Promise.resolve({ id: quizId }),
  });
  assert.equal(res.status, 201);
  const raw = await res.text();
  // The key lives in these fields — none may appear in any student payload.
  assert.equal(raw.includes('isCorrect'), false, raw);
  assert.equal(raw.includes('correctText'), false, raw);
  assert.equal(raw.includes('acceptedAnswers'), false, raw);
  assert.equal(raw.includes('correctAnswers'), false, raw);
  // The fill-blank answer itself must not leak either.
  assert.equal(raw.includes('H2O'), false, raw);
  // But the questions and options ARE there for the student to answer.
  const body = JSON.parse(raw);
  assert.equal(body.quiz.questions.length, 2);
  assert.equal(body.quiz.questions[0].options.length, 3);
});

test('ANSWER-KEY SECURITY: resume (GET attempt) payload is also key-free, and other students get 403', async () => {
  const { POST } = await import('../app/api/student/quizzes/[id]/start/route');
  const { GET } = await import('../app/api/student/quizzes/[id]/attempts/[attemptId]/route');
  __setTestSession(STU1);
  const started = await POST(jsonReq(`http://localhost/api/student/quizzes/${quizId}/start`, 'POST'), {
    params: Promise.resolve({ id: quizId }),
  });
  const startedBody = await started.json();
  const attemptId = startedBody.attempt.id as string;

  const res = await GET(new NextRequest(`http://localhost/api/student/quizzes/${quizId}/attempts/${attemptId}`), {
    params: Promise.resolve({ id: quizId, attemptId }),
  });
  assert.equal(res.status, 200);
  const raw = await res.text();
  assert.equal(raw.includes('isCorrect'), false, raw);
  assert.equal(raw.includes('correctText'), false, raw);
  assert.equal(raw.includes('acceptedAnswers'), false, raw);
  assert.equal(raw.includes('H2O'), false, raw);

  __setTestSession(STU2);
  const other = await GET(new NextRequest(`http://localhost/api/student/quizzes/${quizId}/attempts/${attemptId}`), {
    params: Promise.resolve({ id: quizId, attemptId }),
  });
  assert.equal(other.status, 403);
});

test('teacher detail DOES include the key; student and anonymous are blocked', async () => {
  const { GET } = await import('../app/api/instructor/quizzes/[id]/route');
  __setTestSession(INST1);
  const res = await GET(new NextRequest(`http://localhost/api/instructor/quizzes/${quizId}`), {
    params: Promise.resolve({ id: quizId }),
  });
  assert.equal(res.status, 200);
  const raw = await res.text();
  assert.equal(raw.includes('isCorrect'), true);
  assert.equal(raw.includes('H2O'), true);

  __setTestSession(STU1);
  const asStudent = await GET(new NextRequest(`http://localhost/api/instructor/quizzes/${quizId}`), {
    params: Promise.resolve({ id: quizId }),
  });
  assert.equal(asStudent.status, 403);

  __setTestSession(null);
  const anon = await GET(new NextRequest(`http://localhost/api/instructor/quizzes/${quizId}`), {
    params: Promise.resolve({ id: quizId }),
  });
  assert.equal(anon.status, 401);
});

test('submit through the route grades and returns the result without the key', async () => {
  const { POST: start } = await import('../app/api/student/quizzes/[id]/start/route');
  const { POST: submit } = await import('../app/api/student/quizzes/[id]/attempts/[attemptId]/submit/route');
  __setTestSession(STU1);
  const started = await start(jsonReq(`http://localhost/api/student/quizzes/${quizId}/start`, 'POST'), {
    params: Promise.resolve({ id: quizId }),
  });
  const startedBody = await started.json();
  const attemptId = startedBody.attempt.id as string;
  const q = startedBody.quiz.questions as Array<{ id: string; options: Array<{ id: string }> }>;

  const res = await submit(
    jsonReq(`http://localhost/api/student/quizzes/${quizId}/attempts/${attemptId}/submit`, 'POST', {
      answers: [
        { questionId: q[0].id, selectedOptionIds: [q[0].options[1].id] },
        { questionId: q[1].id, textAnswer: 'h2o' },
      ],
    }),
    { params: Promise.resolve({ id: quizId, attemptId }) },
  );
  assert.equal(res.status, 200);
  const raw = await res.text();
  // The key itself must never appear: no key text, no key fields, no
  // correct-answers block (showCorrectAnswers is off for this quiz).
  assert.equal(raw.includes('correctText'), false, raw);
  assert.equal(raw.includes('acceptedAnswers'), false, raw);
  assert.equal(raw.includes('correctAnswers'), false, raw);
  assert.equal(raw.includes('H2O'), false, raw);
  const body = JSON.parse(raw);
  assert.equal(body.result.score, 5);
  assert.equal(body.result.totalPoints, 5);
  assert.equal(body.result.passed, true);
  // Per-question correctness IS the student's own result after submission.
  assert.equal(body.result.perQuestion.length, 2);
  assert.equal(body.result.perQuestion[0].isCorrect, true);
  // ...but the attempt's own answers carry no grading fields.
  assert.ok(!body.result.attempt.answers.some((a: Record<string, unknown>) => 'isCorrect' in a || 'pointsAwarded' in a));
});

test('text import route: instructor imports pasted text into a draft; student is blocked; garbage is rejected', async () => {
  const { POST } = await import('../app/api/instructor/quizzes/[id]/import-text/route');
  const { QUIZ_TEXT_IMPORT_SAMPLE } = await import('../lib/services/quiz-text-format');
  const created = await createQuizForTeacher(
    { id: 'inst-1', role: 'instructor', name: 'Usman' },
    { courseId: 'course-1', title: 'Draft for import' },
  );
  assert.ok('quiz' in created);
  const draftId = created.quiz.id;

  __setTestSession(STU1);
  const asStudent = await POST(
    jsonReq(`http://localhost/api/instructor/quizzes/${draftId}/import-text`, 'POST', { text: QUIZ_TEXT_IMPORT_SAMPLE }),
    { params: Promise.resolve({ id: draftId }) },
  );
  assert.equal(asStudent.status, 403);

  __setTestSession(INST1);
  const garbage = await POST(
    jsonReq(`http://localhost/api/instructor/quizzes/${draftId}/import-text`, 'POST', { text: 'A document about cats.' }),
    { params: Promise.resolve({ id: draftId }) },
  );
  assert.equal(garbage.status, 400);

  const res = await POST(
    jsonReq(`http://localhost/api/instructor/quizzes/${draftId}/import-text`, 'POST', { text: QUIZ_TEXT_IMPORT_SAMPLE }),
    { params: Promise.resolve({ id: draftId }) },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.parsed.questions, 3);
  assert.equal(body.parsed.warnings, 0);
  assert.equal(body.quiz.questions.length, 3);
  assert.equal(body.quiz.questions[0].explanation, 'Paris is the capital of France.');
});

test('questions route: instructor saves edited questions on a draft', async () => {
  const { POST } = await import('../app/api/instructor/quizzes/[id]/questions/route');
  const created = await createQuizForTeacher(
    { id: 'inst-1', role: 'instructor', name: 'Usman' },
    { courseId: 'course-1', title: 'Draft for edit' },
  );
  assert.ok('quiz' in created);
  const draftId = created.quiz.id;

  __setTestSession(INST1);
  const res = await POST(
    jsonReq(`http://localhost/api/instructor/quizzes/${draftId}/questions`, 'POST', {
      questions: [
        {
          type: 'mcq',
          prompt: 'What is 2 + 2?',
          points: 2,
          explanation: '2 + 2 is 4.',
          options: [
            { text: '3', isCorrect: false },
            { text: '4', isCorrect: true },
          ],
        },
      ],
    }),
    { params: Promise.resolve({ id: draftId }) },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.quiz.questions.length, 1);
  assert.equal(body.quiz.questions[0].explanation, '2 + 2 is 4.');
});

test('admin announcements: create fires the hook, list works, student is blocked', async () => {
  const { GET, POST } = await import('../app/api/admin/announcements/route');
  __setTestSession(STU1);
  const blocked = await POST(jsonReq('http://localhost/api/admin/announcements', 'POST', {
    title: 'Hello', content: 'World', type: 'site-wide',
  }));
  assert.equal(blocked.status, 403);

  __setTestSession(ADMIN);
  const created = await POST(jsonReq('http://localhost/api/admin/announcements', 'POST', {
    title: 'Hello', content: 'World', type: 'site-wide',
  }));
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.announcement.title, 'Hello');

  const listed = await GET();
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.equal(listedBody.announcements.length, 1);

  // The hook notified users: notification rows exist for the students.
  const notifications = [...(fake.tables['Notification']?.values() ?? [])];
  assert.ok(notifications.length >= 2, `expected >=2 notifications, got ${notifications.length}`);
});
