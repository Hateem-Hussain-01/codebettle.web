/**
 * Quiz service tests (Phase 5, text import in Phase 4 Module 8) — RBAC,
 * text import, publish gating (validity only, no review step),
 * attempt lifecycle, server-side timing, grading through the service,
 * result visibility, and analytics. Runs on the fake db.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  createQuizForTeacher,
  getQuizAnalytics,
  getQuizForTeacher,
  importQuizText,
  listAvailableQuizzes,
  publishQuiz,
  saveQuizQuestions,
  startAttempt,
  submitAttempt,
  type QuestionInput,
} from '../lib/services/quiz-service';
import { QUIZ_TEXT_IMPORT_SAMPLE } from '../lib/services/quiz-text-format';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);
const T0 = D('2026-01-10T10:00:00.000Z');

const INST1: Actor = { id: 'inst-1', role: 'instructor', name: 'Usman' };
const INST2: Actor = { id: 'inst-2', role: 'instructor', name: 'Fatima' };
const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Ahmad' };
const STU1: Actor = { id: 'stu-1', role: 'student', name: 'Ali' };
const STU2: Actor = { id: 'stu-2', role: 'student', name: 'Sara' };

let fake: FakeDb;

function seedBase() {
  fake.seed('User', [
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-2', name: 'Fatima', email: 'fatima@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
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
    {
      id: 'course-2', slug: 'flutter-101', title: 'Flutter 101', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Mobile_Development', level: 'beginner', pricePkr: 4000, isFree: false,
      instructorId: 'inst-2', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
}

const THREE_QUESTIONS: QuestionInput[] = [
  {
    type: 'mcq',
    prompt: 'What is 2 + 2?',
    points: 2,
    explanation: '2 + 2 is 4.',
    options: [
      { text: '3', isCorrect: false },
      { text: '4', isCorrect: true },
      { text: '5', isCorrect: false },
    ],
  },
  {
    type: 'fill_blank',
    prompt: 'The chemical symbol for water is ______.',
    points: 3,
    correctText: 'H2O',
    explanation: 'H stands for hydrogen and O for oxygen.',
    options: [],
  },
  {
    type: 'choose_two',
    prompt: 'Select exactly two primary colours:',
    points: 4,
    options: [
      { text: 'Red', isCorrect: true },
      { text: 'Green', isCorrect: false },
      { text: 'Blue', isCorrect: true },
      { text: 'Yellow', isCorrect: false },
    ],
  },
];

async function makePublishedQuiz(actor: Actor = INST1, overrides: Record<string, unknown> = {}) {
  const created = await createQuizForTeacher(actor, {
    courseId: 'course-1',
    title: 'Week 1 Quiz',
    timeLimitMin: 30,
    attemptsAllowed: 1,
    passMark: 50,
    ...overrides,
  });
  assert.ok('quiz' in created, JSON.stringify(created));
  const saved = await saveQuizQuestions(actor, created.quiz.id, THREE_QUESTIONS);
  assert.ok('quiz' in saved, JSON.stringify(saved));
  const published = await publishQuiz(actor, created.quiz.id);
  assert.ok('quiz' in published, JSON.stringify(published));
  return published.quiz;
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedBase();
});

test.afterEach(() => {
  __resetDbClient();
});

test('instructor creates a quiz for their own course; another instructor gets 403; student gets 403', async () => {
  const ok = await createQuizForTeacher(INST1, { courseId: 'course-1', title: 'Q' });
  assert.ok('quiz' in ok);
  assert.equal(ok.quiz.status, 'draft');
  const other = await createQuizForTeacher(INST2, { courseId: 'course-1', title: 'Q' });
  assert.ok('error' in other && other.status === 403);
  const student = await createQuizForTeacher(STU1, { courseId: 'course-1', title: 'Q' });
  assert.ok('error' in student && student.status === 403);
  const missing = await createQuizForTeacher(INST1, { courseId: 'nope', title: 'Q' });
  assert.ok('error' in missing && missing.status === 404);
});

test('admin can create a quiz for any course', async () => {
  const created = await createQuizForTeacher(ADMIN, { courseId: 'course-2', title: 'Admin quiz' });
  assert.ok('quiz' in created);
});

test('invalid settings are rejected (time limit, attempts, pass mark)', async () => {
  for (const bad of [
    { timeLimitMin: 0 },
    { attemptsAllowed: 0 },
    { passMark: 101 },
  ]) {
    const r = await createQuizForTeacher(INST1, { courseId: 'course-1', title: 'Q', ...bad });
    assert.ok('error' in r && r.status === 400, JSON.stringify(r));
  }
});

test('text import parses the sample format into 3 clean questions with explanations', async () => {
  const created = await createQuizForTeacher(INST1, { courseId: 'course-1', title: 'Imported' });
  assert.ok('quiz' in created);
  const imported = await importQuizText(INST1, created.quiz.id, QUIZ_TEXT_IMPORT_SAMPLE);
  assert.ok('quiz' in imported, JSON.stringify(imported));
  assert.equal(imported.parsed.questions, 3);
  assert.equal(imported.parsed.warnings, 0);
  assert.equal(imported.parsed.flagged, 0);
  assert.equal(imported.quiz.questions?.length, 3);
  assert.ok(imported.quiz.questions?.every((q) => !q.needsReview));
  assert.equal(imported.quiz.questions?.[0].explanation, 'Paris is the capital of France.');
  assert.equal(imported.quiz.questions?.[1].correctText, 'H2O');
  // No PDF is stored any more.
  assert.equal(imported.quiz.pdfUrl, undefined);
  assert.equal(imported.quiz.pdfStoragePath, undefined);
  // A clean import can publish straight away — no review step.
  const published = await publishQuiz(INST1, created.quiz.id);
  assert.ok('quiz' in published, JSON.stringify(published));
});

test('text import flags an incomplete question but still imports it; publish is blocked until the key is fixed', async () => {
  const created = await createQuizForTeacher(INST1, { courseId: 'course-1', title: 'Imported' });
  assert.ok('quiz' in created);
  const imported = await importQuizText(
    INST1,
    created.quiz.id,
    `Question 1: What is 2 + 2?
A. 3
B. 4
C. 5
D. 6
Explanation: Simple addition.
`,
  );
  assert.ok('quiz' in imported, JSON.stringify(imported));
  assert.equal(imported.parsed.questions, 1);
  // Two warnings: no "Correct Answer:" line, and no correct option marked.
  assert.equal(imported.parsed.warnings, 2);
  assert.equal(imported.parsed.flagged, 1);
  assert.equal(imported.quiz.questions?.[0].needsReview, true);
  assert.equal(imported.quiz.parseWarnings?.length, 2);

  // Publish is blocked: the question has no correct answer to grade.
  const blocked = await publishQuiz(INST1, created.quiz.id);
  assert.ok('error' in blocked && blocked.status === 400 && blocked.error.includes('no correct option'));

  // Fix the key by saving the questions, then publish works.
  const fixed = await saveQuizQuestions(INST1, created.quiz.id, [
    {
      type: 'mcq',
      prompt: 'What is 2 + 2?',
      points: 1,
      explanation: 'Simple addition.',
      options: [
        { text: '3', isCorrect: false },
        { text: '4', isCorrect: true },
        { text: '5', isCorrect: false },
        { text: '6', isCorrect: false },
      ],
    },
  ]);
  assert.ok('quiz' in fixed);
  assert.equal(fixed.quiz.questions?.[0].needsReview, false);
  const published = await publishQuiz(INST1, created.quiz.id);
  assert.ok('quiz' in published, JSON.stringify(published));
});

test('text import rejects an empty paste, garbage text without wiping questions, and a non-draft quiz', async () => {
  const created = await createQuizForTeacher(INST1, { courseId: 'course-1', title: 'Imported' });
  assert.ok('quiz' in created);
  const empty = await importQuizText(INST1, created.quiz.id, '   ');
  assert.ok('error' in empty && empty.status === 400);

  // Seed real questions, then paste garbage: the 400 must not wipe them.
  const saved = await saveQuizQuestions(INST1, created.quiz.id, THREE_QUESTIONS);
  assert.ok('quiz' in saved);
  const garbage = await importQuizText(INST1, created.quiz.id, 'This is a document about cats.');
  assert.ok('error' in garbage && garbage.status === 400);
  const kept = await getQuizForTeacher(INST1, created.quiz.id);
  assert.ok('quiz' in kept);
  assert.equal(kept.quiz.questions?.length, 3);

  const quiz = await makePublishedQuiz();
  const published = await importQuizText(INST1, quiz.id, QUIZ_TEXT_IMPORT_SAMPLE);
  assert.ok('error' in published && published.status === 400);
});

test('publish is blocked with no questions; a flagged question with a valid key does NOT block publishing', async () => {
  const created = await createQuizForTeacher(INST1, { courseId: 'course-1', title: 'Empty' });
  assert.ok('quiz' in created);
  const empty = await publishQuiz(INST1, created.quiz.id);
  assert.ok('error' in empty && empty.status === 400 && empty.error.includes('at least one question'));

  // Fill-in-the-blank with no blank marker is flagged by the parser
  // (needsReview) but has a correct answer — there is no review step,
  // so it publishes.
  const imported = await importQuizText(
    INST1,
    created.quiz.id,
    `Question 1: What is the chemical symbol for water?
Correct Answer: H2O
Explanation: Water is H2O.
`,
  );
  assert.ok('quiz' in imported, JSON.stringify(imported));
  assert.equal(imported.quiz.questions?.[0].needsReview, true);
  const published = await publishQuiz(INST1, created.quiz.id);
  assert.ok('quiz' in published, JSON.stringify(published));
});

test('question save forces the flag back on when the key is missing, then publish succeeds once fixed', async () => {
  const created = await createQuizForTeacher(INST1, { courseId: 'course-1', title: 'Fix me' });
  assert.ok('quiz' in created);
  // Teacher saves an MCQ with no correct option.
  const saved = await saveQuizQuestions(INST1, created.quiz.id, [
    { type: 'mcq', prompt: 'Pick', points: 1, options: [{ text: 'A' }, { text: 'B' }] },
  ]);
  assert.ok('quiz' in saved);
  assert.equal(saved.quiz.questions?.[0].needsReview, true);
  const blocked = await publishQuiz(INST1, created.quiz.id);
  assert.ok('error' in blocked && blocked.status === 400 && blocked.error.includes('no correct option'));
  // Fix the key, then publish works.
  const fixed = await saveQuizQuestions(INST1, created.quiz.id, [
    { type: 'mcq', prompt: 'Pick', points: 1, options: [{ text: 'A', isCorrect: true }, { text: 'B' }] },
  ]);
  assert.ok('quiz' in fixed);
  assert.equal(fixed.quiz.questions?.[0].needsReview, false);
  const published = await publishQuiz(INST1, created.quiz.id);
  assert.ok('quiz' in published);
});

test('student start: resume returns the same attempt, and the payload has no answer key', async () => {
  const quiz = await makePublishedQuiz();
  const first = await startAttempt(STU1, quiz.id, T0);
  assert.ok('attempt' in first, JSON.stringify(first));
  assert.equal(first.attempt.status, 'in_progress');
  assert.equal(first.attempt.dueAt, new Date(T0.getTime() + 30 * 60_000).toISOString());
  assert.equal(first.quiz.questions.length, 3);
  // No answer key in the payload.
  assert.equal(JSON.stringify(first.quiz).includes('isCorrect'), false);
  assert.equal(JSON.stringify(first.quiz).includes('H2O'), false);
  const second = await startAttempt(STU1, quiz.id, T0);
  assert.ok('attempt' in second);
  assert.equal(second.attempt.id, first.attempt.id);
});

test('student cannot start a quiz for a course they are not enrolled in', async () => {
  const created = await createQuizForTeacher(INST2, { courseId: 'course-2', title: 'Flutter quiz' });
  assert.ok('quiz' in created);
  await saveQuizQuestions(INST2, created.quiz.id, THREE_QUESTIONS);
  await publishQuiz(INST2, created.quiz.id);
  const started = await startAttempt(STU1, created.quiz.id, T0);
  assert.ok('error' in started && started.status === 403);
});

test('availability window is enforced', async () => {
  const future = await createQuizForTeacher(INST1, {
    courseId: 'course-1',
    title: 'Future quiz',
    availableFrom: new Date(T0.getTime() + 60_000).toISOString(),
  });
  assert.ok('quiz' in future);
  await saveQuizQuestions(INST1, future.quiz.id, THREE_QUESTIONS);
  await publishQuiz(INST1, future.quiz.id);
  const early = await startAttempt(STU1, future.quiz.id, T0);
  assert.ok('error' in early && early.status === 400 && early.error.includes('not available yet'));

  const past = await createQuizForTeacher(INST1, {
    courseId: 'course-1',
    title: 'Past quiz',
    availableUntil: new Date(T0.getTime() - 60_000).toISOString(),
  });
  assert.ok('quiz' in past);
  await saveQuizQuestions(INST1, past.quiz.id, THREE_QUESTIONS);
  await publishQuiz(INST1, past.quiz.id);
  const late = await startAttempt(STU1, past.quiz.id, T0);
  assert.ok('error' in late && late.status === 400 && late.error.includes('no longer available'));
});

test('submit enforces exact selection counts, grades, and blocks a second submit', async () => {
  const quiz = await makePublishedQuiz();
  const started = await startAttempt(STU1, quiz.id, T0);
  assert.ok('attempt' in started);
  const q = started.quiz.questions;
  const mcqId = q.find((item) => item.type === 'mcq')!.id;
  const fillId = q.find((item) => item.type === 'fill_blank')!.id;
  const chooseId = q.find((item) => item.type === 'choose_two')!.id;
  const mcqOpt = q.find((item) => item.type === 'mcq')!.options;
  const chooseOpts = q.find((item) => item.type === 'choose_two')!.options;

  // Choose Two with only one selection -> 400.
  const bad = await submitAttempt(
    STU1,
    started.attempt.id,
    [{ questionId: chooseId, selectedOptionIds: [chooseOpts[0].id] }],
    new Date(T0.getTime() + 60_000),
  );
  assert.ok('error' in bad && bad.status === 400 && bad.error.includes('exactly 2'));

  // Full correct submit: 2 + 3 + 4 = 9/9, passed (pass mark 50%).
  const done = await submitAttempt(
    STU1,
    started.attempt.id,
    [
      { questionId: mcqId, selectedOptionIds: [mcqOpt[1].id] },
      { questionId: fillId, textAnswer: 'h2o' },
      { questionId: chooseId, selectedOptionIds: [chooseOpts[0].id, chooseOpts[2].id] },
    ],
    new Date(T0.getTime() + 5 * 60_000),
  );
  assert.ok('result' in done, JSON.stringify(done));
  assert.equal(done.result.score, 9);
  assert.equal(done.result.totalPoints, 9);
  assert.equal(done.result.passed, true);
  assert.equal(done.result.attempt.status, 'submitted');
  assert.equal(done.result.attempt.timeSpentSec, 300);

  // Second submit -> 400.
  const again = await submitAttempt(STU1, started.attempt.id, [], new Date(T0.getTime() + 6 * 60_000));
  assert.ok('error' in again && again.status === 400);
});

test('attemptsAllowed is enforced after a submit', async () => {
  const quiz = await makePublishedQuiz();
  const first = await startAttempt(STU1, quiz.id, T0);
  assert.ok('attempt' in first);
  const submitted = await submitAttempt(STU1, first.attempt.id, [], new Date(T0.getTime() + 60_000));
  assert.ok('result' in submitted);
  const second = await startAttempt(STU1, quiz.id, new Date(T0.getTime() + 2 * 60_000));
  assert.ok('error' in second && second.status === 400 && second.error.includes('used all attempts'));
});

test('late submit is accepted but flagged submittedLate', async () => {
  const quiz = await makePublishedQuiz();
  const started = await startAttempt(STU1, quiz.id, T0);
  assert.ok('attempt' in started);
  // 30-minute limit; submit 45 minutes after start.
  const done = await submitAttempt(STU1, started.attempt.id, [], new Date(T0.getTime() + 45 * 60_000));
  assert.ok('result' in done);
  assert.equal(done.result.attempt.submittedLate, true);
  assert.equal(done.result.score, 0);
});

test('results are hidden when the teacher hides them; correct answers only when allowed', async () => {
  const hidden = await makePublishedQuiz(INST1, { showResultsToStudents: false });
  const started = await startAttempt(STU1, hidden.id, T0);
  assert.ok('attempt' in started);
  const done = await submitAttempt(STU1, started.attempt.id, [], new Date(T0.getTime() + 60_000));
  assert.ok('result' in done);
  assert.equal(done.result.score, null);
  assert.equal(done.result.perQuestion, undefined);

  const shown = await makePublishedQuiz(INST1, { showResultsToStudents: true, showCorrectAnswers: true });
  const started2 = await startAttempt(STU1, shown.id, T0);
  assert.ok('attempt' in started2);
  const done2 = await submitAttempt(STU1, started2.attempt.id, [], new Date(T0.getTime() + 60_000));
  assert.ok('result' in done2);
  assert.equal(done2.result.score, 0);
  assert.ok(done2.result.correctAnswers && done2.result.correctAnswers.length === 3);
});

test('analytics: participation, per-question accuracy, per-student scores, topics', async () => {
  const quiz = await makePublishedQuiz();
  // stu-1: perfect. stu-2: only the MCQ right.
  const a1 = await startAttempt(STU1, quiz.id, T0);
  assert.ok('attempt' in a1);
  const q1 = a1.quiz.questions;
  await submitAttempt(
    STU1,
    a1.attempt.id,
    [
      { questionId: q1[0].id, selectedOptionIds: [q1[0].options[1].id] },
      { questionId: q1[1].id, textAnswer: 'H2O' },
      { questionId: q1[2].id, selectedOptionIds: [q1[2].options[0].id, q1[2].options[2].id] },
    ],
    new Date(T0.getTime() + 60_000),
  );
  const a2 = await startAttempt(STU2, quiz.id, T0);
  assert.ok('attempt' in a2);
  const q2 = a2.quiz.questions;
  await submitAttempt(
    STU2,
    a2.attempt.id,
    [
      { questionId: q2[0].id, selectedOptionIds: [q2[0].options[1].id] },
      { questionId: q2[1].id, textAnswer: 'wrong' },
      { questionId: q2[2].id, selectedOptionIds: [q2[2].options[1].id, q2[2].options[3].id] },
    ],
    new Date(T0.getTime() + 60_000),
  );

  const analytics = await getQuizAnalytics(INST1, quiz.id);
  assert.ok('analytics' in analytics, JSON.stringify(analytics));
  assert.equal(analytics.analytics.submittedAttempts, 2);
  assert.equal(analytics.analytics.uniqueStudents, 2);
  assert.equal(analytics.analytics.totalPoints, 9);
  assert.equal(analytics.analytics.averageScore, 5.5);
  assert.equal(analytics.analytics.perQuestion[0].accuracy, 100);
  assert.equal(analytics.analytics.perQuestion[1].accuracy, 50);
  assert.equal(analytics.analytics.perStudent[0].bestScore, 9);
  assert.equal(analytics.analytics.perStudent[1].bestScore, 2);

  // Another instructor cannot see it.
  const forbidden = await getQuizAnalytics(INST2, quiz.id);
  assert.ok('error' in forbidden && forbidden.status === 403);
  // Admin can.
  const adminView = await getQuizAnalytics(ADMIN, quiz.id);
  assert.ok('analytics' in adminView);
});

test('available quizzes list shows only published quizzes for enrolled courses', async () => {
  const quiz = await makePublishedQuiz();
  const draft = await createQuizForTeacher(INST1, { courseId: 'course-1', title: 'Draft quiz' });
  assert.ok('quiz' in draft);
  const list = await listAvailableQuizzes(STU1);
  assert.ok('quizzes' in list);
  assert.equal(list.quizzes.length, 1);
  assert.equal(list.quizzes[0].quiz.id, quiz.id);
  assert.equal(list.quizzes[0].attemptsLeft, 1);
});
