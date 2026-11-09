/**
 * Quiz repository (Phase 5, Prisma-backed).
 *
 * Quizzes belong to a course and are created by the course's instructor
 * (or an admin). Drafts carry parsed questions from an uploaded PDF;
 * a quiz is only published after the teacher reviews every question
 * (enforced in lib/services/quiz-service.ts, not here).
 *
 * Answer-key material (QuizOption.isCorrect, QuizQuestion.correctText /
 * acceptedAnswers) lives in these rows. The repository returns the full
 * rows for teacher/admin use; student delivery goes through
 * toPublicQuiz() in mappers.ts, which strips the key. Never hand a
 * repository Quiz to a student response.
 */
import { getDb } from './client';
import {
  mapQuizAnswerRow,
  mapQuizAttemptRow,
  mapQuizQuestionRow,
  mapQuizRow,
  stripUndefined,
} from './mappers';
import type {
  CourseLevel,
  Quiz,
  QuizAnswer,
  QuizAttempt,
  QuizAttemptStatus,
  QuizQuestion,
  QuizQuestionType,
  QuizScoringPolicy,
  QuizStatus,
} from './types';

async function loadQuestions(quizId: string): Promise<
  Array<{ question: import('./types').QuizQuestionRow; options: import('./types').QuizOptionRow[] }>
> {
  const questionRows = await getDb()
    .orm.public.QuizQuestion.where({ quizId })
    .orderBy((q) => q.position.asc())
    .all();
  const out: Array<{ question: import('./types').QuizQuestionRow; options: import('./types').QuizOptionRow[] }> = [];
  for (const question of questionRows) {
    const options = await getDb()
      .orm.public.QuizOption.where({ questionId: question.id })
      .orderBy((o) => o.position.asc())
      .all();
    out.push({ question, options });
  }
  return out;
}

async function loadQuizWithQuestions(id: string): Promise<Quiz | null> {
  const row = await getDb()
    .orm.public.Quiz.where({ id })
    .where((q) => q.deletedAt.isNull())
    .first();
  if (!row) return null;
  return mapQuizRow(row, await loadQuestions(id));
}

export async function getQuizById(id: string): Promise<Quiz | null> {
  return loadQuizWithQuestions(id);
}

/** The quiz row without questions (metadata only). */
export async function getQuizMeta(id: string): Promise<Quiz | null> {
  const row = await getDb()
    .orm.public.Quiz.where({ id })
    .where((q) => q.deletedAt.isNull())
    .first();
  if (!row) return null;
  return mapQuizRow(row, []);
}

export async function listQuizzesByCourse(courseId: string): Promise<Quiz[]> {
  const rows = await getDb()
    .orm.public.Quiz.where({ courseId })
    .where((q) => q.deletedAt.isNull())
    .orderBy((q) => q.createdAt.desc())
    .all();
  return rows.map((r) => mapQuizRow(r, []));
}

export async function listQuizzesByCreator(createdById: string): Promise<Quiz[]> {
  const rows = await getDb()
    .orm.public.Quiz.where({ createdById })
    .where((q) => q.deletedAt.isNull())
    .orderBy((q) => q.createdAt.desc())
    .all();
  return rows.map((r) => mapQuizRow(r, []));
}

/** All non-deleted quizzes (admin lists). */
export async function listAllQuizzes(): Promise<Quiz[]> {
  const rows = await getDb()
    .orm.public.Quiz.where((q) => q.deletedAt.isNull())
    .orderBy((q) => q.createdAt.desc())
    .all();
  return rows.map((r) => mapQuizRow(r, []));
}

export async function listPublishedQuizzesByCourse(courseId: string): Promise<Quiz[]> {
  const rows = await getDb()
    .orm.public.Quiz.where({ courseId })
    .where({ status: 'published' })
    .where((q) => q.deletedAt.isNull())
    .orderBy((q) => q.createdAt.desc())
    .all();
  return rows.map((r) => mapQuizRow(r, []));
}

export interface CreateQuizInput {
  courseId: string;
  title: string;
  description?: string;
  topics?: string[];
  difficulty?: CourseLevel;
  timeLimitMin?: number;
  attemptsAllowed?: number;
  passMark?: number;
  scoringPolicy?: QuizScoringPolicy;
  showResultsToStudents?: boolean;
  showCorrectAnswers?: boolean;
  availableFrom?: string | null;
  availableUntil?: string | null;
  instructions?: string;
  createdById: string;
}

export async function createQuiz(input: CreateQuizInput): Promise<Quiz> {
  const row = await getDb().orm.public.Quiz.create({
    courseId: input.courseId,
    title: input.title,
    description: input.description ?? null,
    topics: input.topics ?? [],
    difficulty: input.difficulty ?? null,
    timeLimitMin: input.timeLimitMin ?? null,
    attemptsAllowed: input.attemptsAllowed ?? 1,
    passMark: input.passMark ?? null,
    scoringPolicy: input.scoringPolicy ?? 'exact',
    showResultsToStudents: input.showResultsToStudents ?? true,
    showCorrectAnswers: input.showCorrectAnswers ?? false,
    availableFrom: input.availableFrom ? new Date(input.availableFrom) : null,
    availableUntil: input.availableUntil ? new Date(input.availableUntil) : null,
    instructions: input.instructions ?? null,
    status: 'draft',
    createdById: input.createdById,
    pdfUrl: null,
    pdfStoragePath: null,
    parseWarnings: null,
  });
  return mapQuizRow(row, []);
}

export interface UpdateQuizInput {
  title?: string;
  description?: string | null;
  topics?: string[];
  difficulty?: CourseLevel | null;
  timeLimitMin?: number | null;
  attemptsAllowed?: number;
  passMark?: number | null;
  scoringPolicy?: QuizScoringPolicy;
  showResultsToStudents?: boolean;
  showCorrectAnswers?: boolean;
  availableFrom?: string | null;
  availableUntil?: string | null;
  instructions?: string | null;
  status?: QuizStatus;
  pdfUrl?: string | null;
  pdfStoragePath?: string | null;
  parseWarnings?: unknown;
}

export async function updateQuiz(id: string, input: UpdateQuizInput): Promise<Quiz | null> {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.topics !== undefined) data.topics = input.topics;
  if (input.difficulty !== undefined) data.difficulty = input.difficulty;
  if (input.timeLimitMin !== undefined) data.timeLimitMin = input.timeLimitMin;
  if (input.attemptsAllowed !== undefined) data.attemptsAllowed = input.attemptsAllowed;
  if (input.passMark !== undefined) data.passMark = input.passMark;
  if (input.scoringPolicy !== undefined) data.scoringPolicy = input.scoringPolicy;
  if (input.showResultsToStudents !== undefined) data.showResultsToStudents = input.showResultsToStudents;
  if (input.showCorrectAnswers !== undefined) data.showCorrectAnswers = input.showCorrectAnswers;
  if (input.availableFrom !== undefined) {
    data.availableFrom = input.availableFrom ? new Date(input.availableFrom) : null;
  }
  if (input.availableUntil !== undefined) {
    data.availableUntil = input.availableUntil ? new Date(input.availableUntil) : null;
  }
  if (input.instructions !== undefined) data.instructions = input.instructions;
  if (input.status !== undefined) data.status = input.status;
  if (input.pdfUrl !== undefined) data.pdfUrl = input.pdfUrl;
  if (input.pdfStoragePath !== undefined) data.pdfStoragePath = input.pdfStoragePath;
  if (input.parseWarnings !== undefined) data.parseWarnings = input.parseWarnings;
  if (Object.keys(data).length > 0) {
    await getDb().orm.public.Quiz.where({ id }).where((q) => q.deletedAt.isNull()).update(stripUndefined(data));
  }
  return loadQuizWithQuestions(id);
}

/** Soft delete: sets deletedAt. Attempts and answers stay for history. */
export async function softDeleteQuiz(id: string): Promise<boolean> {
  const row = await getDb()
    .orm.public.Quiz.where({ id })
    .where((q) => q.deletedAt.isNull())
    .update({ deletedAt: new Date() });
  return row !== null;
}

// ---------------------------------------------------------------------------
// Questions & options
// ---------------------------------------------------------------------------

export interface QuizQuestionInput {
  type: QuizQuestionType;
  prompt: string;
  points?: number;
  topic?: string;
  difficulty?: CourseLevel;
  correctText?: string;
  acceptedAnswers?: string[];
  needsReview?: boolean;
  reviewNote?: string;
  options: Array<{ text: string; isCorrect?: boolean }>;
}

/**
 * Replace a quiz's questions wholesale (review edits, re-parse).
 * Deletes existing options + questions first (the real DB cascades
 * options, the test fake does not — explicit deletes keep both honest),
 * then inserts the new set at contiguous 1-based positions.
 */
export async function replaceQuizQuestions(quizId: string, questions: QuizQuestionInput[]): Promise<QuizQuestion[]> {
  const existing = await getDb().orm.public.QuizQuestion.where({ quizId }).all();
  for (const q of existing) {
    await getDb().orm.public.QuizOption.where({ questionId: q.id }).deleteAll();
  }
  await getDb().orm.public.QuizQuestion.where({ quizId }).deleteAll();
  const created: QuizQuestion[] = [];
  for (let i = 0; i < questions.length; i++) {
    const input = questions[i];
    const row = await getDb().orm.public.QuizQuestion.create({
      quizId,
      type: input.type,
      position: i + 1,
      prompt: input.prompt,
      points: input.points ?? 1,
      topic: input.topic ?? null,
      difficulty: input.difficulty ?? null,
      correctText: input.correctText ?? null,
      acceptedAnswers: input.acceptedAnswers ?? [],
      needsReview: input.needsReview ?? false,
      reviewNote: input.reviewNote ?? null,
    });
    const optionRows = [];
    for (let j = 0; j < input.options.length; j++) {
      const option = await getDb().orm.public.QuizOption.create({
        questionId: row.id,
        text: input.options[j].text,
        position: j + 1,
        isCorrect: input.options[j].isCorrect ?? false,
      });
      optionRows.push(option);
    }
    created.push(mapQuizQuestionRow(row, optionRows));
  }
  return created;
}

/** Mark one question reviewed (clears needsReview + note). */
export async function markQuestionReviewed(questionId: string): Promise<boolean> {
  const row = await getDb()
    .orm.public.QuizQuestion.where({ id: questionId })
    .update({ needsReview: false, reviewNote: null });
  return row !== null;
}

// ---------------------------------------------------------------------------
// Attempts & answers
// ---------------------------------------------------------------------------

export async function getAttemptById(id: string): Promise<QuizAttempt | null> {
  const row = await getDb().orm.public.QuizAttempt.where({ id }).first();
  if (!row) return null;
  const answers = await getDb().orm.public.QuizAnswer.where({ attemptId: id }).all();
  return mapQuizAttemptRow(row, answers);
}

export async function getInProgressAttempt(quizId: string, studentId: string): Promise<QuizAttempt | null> {
  const row = await getDb()
    .orm.public.QuizAttempt.where({ quizId })
    .where({ studentId })
    .where({ status: 'in_progress' })
    .orderBy((a) => a.startedAt.desc())
    .first();
  if (!row) return null;
  const answers = await getDb().orm.public.QuizAnswer.where({ attemptId: row.id }).all();
  return mapQuizAttemptRow(row, answers);
}

export async function listAttemptsByQuiz(quizId: string): Promise<QuizAttempt[]> {
  const rows = await getDb()
    .orm.public.QuizAttempt.where({ quizId })
    .orderBy((a) => a.startedAt.desc())
    .all();
  const out: QuizAttempt[] = [];
  for (const row of rows) {
    const answers = await getDb().orm.public.QuizAnswer.where({ attemptId: row.id }).all();
    out.push(mapQuizAttemptRow(row, answers));
  }
  return out;
}

export async function listAttemptsByStudent(quizId: string, studentId: string): Promise<QuizAttempt[]> {
  const rows = await getDb()
    .orm.public.QuizAttempt.where({ quizId })
    .where({ studentId })
    .orderBy((a) => a.startedAt.desc())
    .all();
  const out: QuizAttempt[] = [];
  for (const row of rows) {
    const answers = await getDb().orm.public.QuizAnswer.where({ attemptId: row.id }).all();
    out.push(mapQuizAttemptRow(row, answers));
  }
  return out;
}

export async function countSubmittedAttempts(quizId: string, studentId: string): Promise<number> {
  const rows = await getDb()
    .orm.public.QuizAttempt.where({ quizId })
    .where({ studentId })
    .where({ status: 'submitted' })
    .all();
  return rows.length;
}

export async function createAttempt(input: {
  quizId: string;
  studentId: string;
  dueAt?: Date | null;
  /** Defaults to now; the service passes its own `now` so timing is testable. */
  startedAt?: Date;
}): Promise<QuizAttempt> {
  const row = await getDb().orm.public.QuizAttempt.create({
    quizId: input.quizId,
    studentId: input.studentId,
    status: 'in_progress',
    startedAt: input.startedAt ?? new Date(),
    dueAt: input.dueAt ?? null,
    submittedAt: null,
    score: null,
    totalPoints: null,
    timeSpentSec: null,
    submittedLate: false,
  });
  return mapQuizAttemptRow(row, []);
}

export async function updateAttempt(
  id: string,
  input: {
    status?: QuizAttemptStatus;
    submittedAt?: Date | null;
    score?: number | null;
    totalPoints?: number | null;
    timeSpentSec?: number | null;
    submittedLate?: boolean;
  },
): Promise<QuizAttempt | null> {
  await getDb().orm.public.QuizAttempt.where({ id }).update(stripUndefined({ ...input }));
  return getAttemptById(id);
}

export async function saveAnswer(input: {
  attemptId: string;
  questionId: string;
  selectedOptionIds: string[];
  textAnswer?: string | null;
}): Promise<QuizAnswer> {
  const existing = await getDb()
    .orm.public.QuizAnswer.where({ attemptId: input.attemptId })
    .where({ questionId: input.questionId })
    .first();
  if (existing) {
    const updated = await getDb()
      .orm.public.QuizAnswer.where({ id: existing.id })
      .update({
        selectedOptionIds: input.selectedOptionIds,
        textAnswer: input.textAnswer ?? null,
      });
    if (!updated) throw new Error('Failed to save answer');
    return mapQuizAnswerRow(updated);
  }
  const row = await getDb().orm.public.QuizAnswer.create({
    attemptId: input.attemptId,
    questionId: input.questionId,
    selectedOptionIds: input.selectedOptionIds,
    textAnswer: input.textAnswer ?? null,
    isCorrect: null,
    pointsAwarded: 0,
    needsManualReview: false,
  });
  return mapQuizAnswerRow(row);
}

export async function gradeAnswer(
  id: string,
  input: { isCorrect: boolean | null; pointsAwarded: number; needsManualReview?: boolean },
): Promise<QuizAnswer | null> {
  const row = await getDb()
    .orm.public.QuizAnswer.where({ id })
    .update({
      isCorrect: input.isCorrect,
      pointsAwarded: input.pointsAwarded,
      ...(input.needsManualReview !== undefined ? { needsManualReview: input.needsManualReview } : {}),
    });
  if (!row) return null;
  return mapQuizAnswerRow(row);
}
