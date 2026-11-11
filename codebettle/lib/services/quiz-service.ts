/**
 * Quiz service (Phase 5).
 *
 * Owns the quiz workflow rules: teacher ownership, review-before-
 * publish gating, PDF import, attempt lifecycle, server-side timing,
 * grading, and analytics. No Next.js imports — unit-testable with the
 * fake db. Audit entries are written best-effort (a logging failure
 * never blocks the quiz action).
 *
 * Answer-key security: the service NEVER returns a full Quiz (with key)
 * to a student. Student-facing functions return toPublicQuiz() shapes
 * only, and submit results honour the quiz's showResultsToStudents /
 * showCorrectAnswers settings.
 */
import { logAudit } from '../db/audit';
import { getCourseById, getCoursesByInstructor } from '../db/courses';
import { getEnrollmentsByStudent, isEnrolled } from '../db/enrollments';
import {
  countSubmittedAttempts,
  createAttempt,
  createQuiz,
  getAttemptById,
  getInProgressAttempt,
  getQuizById,
  gradeAnswer,
  listAllQuizzes,
  listAttemptsByQuiz,
  listAttemptsByStudent,
  listPublishedQuizzesByCourse,
  listQuizzesByCourse,
  replaceQuizQuestions,
  saveAnswer,
  softDeleteQuiz,
  updateAttempt,
  updateQuiz,
  type QuizQuestionInput,
  type UpdateQuizInput,
} from '../db/quizzes';
import { getUserById } from '../db/users';
import { toPublicQuiz } from '../db/mappers';
import type {
  Quiz,
  QuizAnswer,
  QuizAttempt,
  QuizQuestion,
  QuizQuestionType,
  QuizScoringPolicy,
  StudentQuizAttempt,
} from '../db/types';
import { requiredSelectionCount, QUIZ_QUESTION_TYPES } from '../db/types';
import { badRequest, forbidden, notFound, type Actor, type ServiceError } from './errors';
import { hasAdminCapability, hasTeacherCapability } from '../rbac';
import { gradeAttempt } from './quiz-grading';
import { parseQuizPdf, MAX_QUIZ_PDF_BYTES, type ParsedQuestion } from './quiz-parser';
import { uploadQuizPdf, type QuizPdfFile } from './quiz-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

type Result<T> = T | ServiceError;

const GRACE_MS = 30_000; // late-submit grace after the deadline

async function audit(actorId: string | null, action: string, entityId: string, detail?: string): Promise<void> {
  try {
    await logAudit({ actorId, action, entity: 'Quiz', entityId, detail });
  } catch {
    // Audit must never block the quiz action.
  }
}

function canManageCourse(actor: Actor, course: { instructorId: string }): boolean {
  // Phase 2: admin flag, or teacher flag (legacy role fallback) + ownership.
  return hasAdminCapability(actor) || (hasTeacherCapability(actor) && course.instructorId === actor.id);
}

async function loadQuizForManagement(actor: Actor, quizId: string): Promise<Result<{ quiz: Quiz }>> {
  const quiz = await getQuizById(quizId);
  if (!quiz) return notFound('Quiz');
  const course = await getCourseById(quiz.courseId);
  if (!course) return notFound('Quiz');
  if (!canManageCourse(actor, course)) return forbidden('You can only manage quizzes for your own courses');
  return { quiz };
}

// ---------------------------------------------------------------------------
// Teacher / admin: create, edit, publish
// ---------------------------------------------------------------------------

export interface CreateQuizServiceInput {
  courseId: string;
  title: string;
  description?: string;
  topics?: string[];
  difficulty?: Quiz['difficulty'];
  timeLimitMin?: number;
  attemptsAllowed?: number;
  passMark?: number;
  scoringPolicy?: QuizScoringPolicy;
  showResultsToStudents?: boolean;
  showCorrectAnswers?: boolean;
  availableFrom?: string | null;
  availableUntil?: string | null;
  instructions?: string;
}

export async function createQuizForTeacher(actor: Actor, input: CreateQuizServiceInput): Promise<Result<{ quiz: Quiz }>> {
  if (!hasTeacherCapability(actor) && !hasAdminCapability(actor)) {
    return forbidden('Only instructors and admins can create quizzes');
  }
  const course = await getCourseById(input.courseId);
  if (!course) return notFound('Course');
  if (!canManageCourse(actor, course)) return forbidden('You can only create quizzes for your own courses');
  if (!input.title.trim()) return badRequest('Quiz title is required');
  if (input.timeLimitMin !== undefined && input.timeLimitMin <= 0) {
    return badRequest('Time limit must be a positive number of minutes');
  }
  if (input.attemptsAllowed !== undefined && input.attemptsAllowed < 1) {
    return badRequest('Attempts allowed must be at least 1');
  }
  if (input.passMark !== undefined && (input.passMark < 0 || input.passMark > 100)) {
    return badRequest('Pass mark must be between 0 and 100');
  }
  const quiz = await createQuiz({ ...input, createdById: actor.id });
  await audit(actor.id, 'quiz.create', quiz.id, `${quiz.title} (course ${course.title})`);
  return { quiz };
}

export async function getQuizForTeacher(actor: Actor, quizId: string): Promise<Result<{ quiz: Quiz }>> {
  if (!hasTeacherCapability(actor) && !hasAdminCapability(actor)) {
    return forbidden('Only instructors and admins can view quiz details');
  }
  return loadQuizForManagement(actor, quizId);
}

export async function listQuizzesForTeacher(actor: Actor): Promise<Result<{ quizzes: Quiz[] }>> {
  if (hasAdminCapability(actor)) return { quizzes: await listAllQuizzes() };
  if (!hasTeacherCapability(actor)) return forbidden('Only instructors and admins can list quizzes');
  // Instructor sees quizzes for courses they teach.
  const myCourses = await getCoursesByInstructor(actor.id);
  const quizzes: Quiz[] = [];
  for (const course of myCourses) {
    quizzes.push(...(await listQuizzesByCourse(course.id)));
  }
  quizzes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { quizzes };
}

// ---------------------------------------------------------------------------
// Teacher / admin: PDF import
// ---------------------------------------------------------------------------

export async function importQuizPdf(
  actor: Actor,
  quizId: string,
  file: QuizPdfFile,
  options?: { storageClient?: SupabaseClient },
): Promise<Result<{ quiz: Quiz; parsed: { questions: number; warnings: number; isScanned: boolean } }>> {
  const loaded = await loadQuizForManagement(actor, quizId);
  if ('error' in loaded) return loaded;
  const { quiz } = loaded;
  if (quiz.status !== 'draft') return badRequest('Only draft quizzes can import a PDF');
  if (file.size > MAX_QUIZ_PDF_BYTES) return badRequest('PDF must be 10 MB or smaller');
  if (file.type !== 'application/pdf') return badRequest('Only PDF files are allowed');

  const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file.arrayBuffer;
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (body.byteLength < 4 || body.subarray(0, 4).toString('latin1') !== '%PDF') {
    return badRequest('The uploaded file is not a PDF');
  }

  // Store the original PDF first, then parse it. If parsing finds
  // nothing, the quiz keeps the stored PDF and zero questions — the
  // teacher adds questions manually in review.
  const stored = await uploadQuizPdf({ ...file, arrayBuffer: body }, options?.storageClient);
  const parsed = await parseQuizPdf(body);
  const questions: QuizQuestionInput[] = parsed.questions.map((q: ParsedQuestion) => ({
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    correctText: q.correctText,
    acceptedAnswers: q.acceptedAnswers,
    needsReview: q.needsReview,
    reviewNote: q.reviewNote,
    options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
  }));
  await replaceQuizQuestions(quizId, questions);
  const updated = await updateQuiz(quizId, {
    pdfUrl: stored.url,
    pdfStoragePath: stored.path,
    parseWarnings: parsed.warnings.length > 0 ? parsed.warnings : null,
  });
  if (!updated) return notFound('Quiz');
  await audit(actor.id, 'quiz.import', quizId, `${parsed.questions.length} questions parsed, ${parsed.warnings.length} warnings`);
  return { quiz: updated, parsed: { questions: parsed.questions.length, warnings: parsed.warnings.length, isScanned: parsed.isScanned } };
}

// ---------------------------------------------------------------------------
// Teacher / admin: review edits + publish gating
// ---------------------------------------------------------------------------

export interface ReviewQuestionInput {
  type: QuizQuestionType;
  prompt: string;
  points: number;
  topic?: string;
  difficulty?: Quiz['difficulty'];
  correctText?: string;
  acceptedAnswers?: string[];
  needsReview?: boolean;
  reviewNote?: string;
  options: Array<{ text: string; isCorrect?: boolean }>;
}

/**
 * Validate one review-edited question and decide whether it still needs
 * review. A teacher may save a question that still needs review — the
 * publish gate (not the save) is what blocks it. But a question cannot
 * be marked reviewed while its answer key is missing or wrong: the flag
 * is forced back on with a note, so review state can never lie.
 */
export function validateReviewQuestion(input: ReviewQuestionInput, index: number): { input: QuizQuestionInput } | ServiceError {
  if (!QUIZ_QUESTION_TYPES.includes(input.type)) return badRequest(`Question ${index + 1}: unknown type "${input.type}"`);
  if (!input.prompt.trim()) return badRequest(`Question ${index + 1}: prompt is required`);
  if (!Number.isInteger(input.points) || input.points < 1) {
    return badRequest(`Question ${index + 1}: points must be a whole number of at least 1`);
  }
  const isOptionType = input.type !== 'fill_blank';
  if (isOptionType) {
    if (!input.options || input.options.length < 2) {
      return badRequest(`Question ${index + 1}: at least 2 options are required`);
    }
    if (input.options.some((o) => !o.text.trim())) {
      return badRequest(`Question ${index + 1}: every option needs text`);
    }
  } else if (input.options && input.options.length > 0) {
    return badRequest(`Question ${index + 1}: fill-in-the-blank questions have no options`);
  }

  let needsReview = input.needsReview ?? false;
  let reviewNote = input.reviewNote;
  if (isOptionType) {
    const correct = (input.options ?? []).filter((o) => o.isCorrect).length;
    if (correct === 0) {
      needsReview = true;
      reviewNote = 'No correct option is marked.';
    } else if (input.type === 'mcq' && correct > 1) {
      needsReview = true;
      reviewNote = 'More than one correct option for an MCQ.';
    } else if (input.type === 'choose_two' && correct !== 2) {
      needsReview = true;
      reviewNote = 'Choose Two needs exactly two correct options.';
    } else if (input.type === 'choose_three' && correct !== 3) {
      needsReview = true;
      reviewNote = 'Choose Three needs exactly three correct options.';
    }
  } else if (!input.correctText?.trim()) {
    needsReview = true;
    reviewNote = 'No correct answer text.';
  }
  return {
    input: {
      type: input.type,
      prompt: input.prompt.trim(),
      points: input.points,
      topic: input.topic,
      difficulty: input.difficulty,
      correctText: input.correctText?.trim() || undefined,
      acceptedAnswers: (input.acceptedAnswers ?? []).map((a) => a.trim()).filter(Boolean),
      needsReview,
      reviewNote,
      options: (input.options ?? []).map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect ?? false })),
    },
  };
}

export async function saveQuizReview(
  actor: Actor,
  quizId: string,
  questions: ReviewQuestionInput[],
): Promise<Result<{ quiz: Quiz }>> {
  const loaded = await loadQuizForManagement(actor, quizId);
  if ('error' in loaded) return loaded;
  if (loaded.quiz.status !== 'draft') return badRequest('Only draft quizzes can be edited');
  const validated: QuizQuestionInput[] = [];
  for (let i = 0; i < questions.length; i++) {
    const result = validateReviewQuestion(questions[i], i);
    if ('error' in result) return result;
    validated.push(result.input);
  }
  await replaceQuizQuestions(quizId, validated);
  const updated = await getQuizById(quizId);
  if (!updated) return notFound('Quiz');
  await audit(actor.id, 'quiz.review', quizId, `${validated.length} questions saved in review`);
  return { quiz: updated };
}

/** Publish blockers: every question must be reviewed and keyed. */
export function publishBlockers(quiz: Quiz): string[] {
  const blockers: string[] = [];
  if (quiz.status !== 'draft') blockers.push('Only a draft quiz can be published');
  const questions = quiz.questions ?? [];
  if (questions.length === 0) blockers.push('Add at least one question before publishing');
  for (const q of questions) {
    if (q.needsReview) blockers.push(`Q${q.position} still needs review${q.reviewNote ? `: ${q.reviewNote}` : ''}`);
  }
  return blockers;
}

export async function publishQuiz(actor: Actor, quizId: string): Promise<Result<{ quiz: Quiz }>> {
  const loaded = await loadQuizForManagement(actor, quizId);
  if ('error' in loaded) return loaded;
  const blockers = publishBlockers(loaded.quiz);
  if (blockers.length > 0) return badRequest(`Cannot publish yet: ${blockers.join('; ')}`);
  const updated = await updateQuiz(quizId, { status: 'published' });
  if (!updated) return notFound('Quiz');
  await audit(actor.id, 'quiz.publish', quizId, updated.title);
  return { quiz: updated };
}

export async function updateQuizForTeacher(
  actor: Actor,
  quizId: string,
  input: Omit<UpdateQuizInput, 'status' | 'pdfUrl' | 'pdfStoragePath' | 'parseWarnings'>,
): Promise<Result<{ quiz: Quiz }>> {
  const loaded = await loadQuizForManagement(actor, quizId);
  if ('error' in loaded) return loaded;
  if (loaded.quiz.status === 'archived') return badRequest('An archived quiz cannot be edited');
  if (input.timeLimitMin !== undefined && input.timeLimitMin !== null && input.timeLimitMin <= 0) {
    return badRequest('Time limit must be a positive number of minutes');
  }
  if (input.attemptsAllowed !== undefined && input.attemptsAllowed < 1) {
    return badRequest('Attempts allowed must be at least 1');
  }
  if (input.passMark !== undefined && input.passMark !== null && (input.passMark < 0 || input.passMark > 100)) {
    return badRequest('Pass mark must be between 0 and 100');
  }
  const updated = await updateQuiz(quizId, input);
  if (!updated) return notFound('Quiz');
  await audit(actor.id, 'quiz.update', quizId, updated.title);
  return { quiz: updated };
}

export async function setQuizStatus(
  actor: Actor,
  quizId: string,
  status: 'draft' | 'archived',
): Promise<Result<{ quiz: Quiz }>> {
  const loaded = await loadQuizForManagement(actor, quizId);
  if ('error' in loaded) return loaded;
  if (loaded.quiz.status === 'published' && status === 'draft') {
    // Unpublishing is allowed (stops new attempts); in-progress attempts keep working.
  }
  const updated = await updateQuiz(quizId, { status });
  if (!updated) return notFound('Quiz');
  await audit(actor.id, `quiz.${status}`, quizId, updated.title);
  return { quiz: updated };
}

export async function deleteQuiz(actor: Actor, quizId: string): Promise<Result<{ deleted: boolean }>> {
  const loaded = await loadQuizForManagement(actor, quizId);
  if ('error' in loaded) return loaded;
  if (loaded.quiz.status === 'published') {
    return badRequest('A published quiz cannot be deleted — archive it instead');
  }
  const deleted = await softDeleteQuiz(quizId);
  await audit(actor.id, 'quiz.delete', quizId, loaded.quiz.title);
  return { deleted };
}

// ---------------------------------------------------------------------------
// Student: availability, attempts, submit
// ---------------------------------------------------------------------------

export interface AvailableQuiz {
  quiz: ReturnType<typeof toPublicQuiz>;
  attemptsUsed: number;
  attemptsLeft: number;
  inProgressAttemptId?: string;
  hasSubmitted: boolean;
}

/** Student-safe attempt: the student's own selections, no grading fields on answers. */
function toStudentAttempt(attempt: QuizAttempt): StudentQuizAttempt {
  return {
    ...attempt,
    answers: (attempt.answers ?? []).map((a) => ({
      id: a.id,
      attemptId: a.attemptId,
      questionId: a.questionId,
      selectedOptionIds: a.selectedOptionIds,
      textAnswer: a.textAnswer,
    })),
  };
}

export async function listAvailableQuizzes(actor: Actor): Promise<Result<{ quizzes: AvailableQuiz[] }>> {
  if (actor.role !== 'student') return forbidden('Only students can list available quizzes');
  const enrollments = await getEnrollmentsByStudent(actor.id);
  const out: AvailableQuiz[] = [];
  for (const enrollment of enrollments) {
    const published = await listPublishedQuizzesByCourse(enrollment.courseId);
    for (const quiz of published) {
      const attempts = await listAttemptsByStudent(quiz.id, actor.id);
      const submitted = attempts.filter((a) => a.status === 'submitted').length;
      const inProgress = attempts.find((a) => a.status === 'in_progress');
      out.push({
        quiz: toPublicQuiz({ ...quiz, questions: [] }),
        attemptsUsed: submitted,
        attemptsLeft: Math.max(0, quiz.attemptsAllowed - submitted),
        inProgressAttemptId: inProgress?.id,
        hasSubmitted: submitted > 0,
      });
    }
  }
  return { quizzes: out };
}

function availabilityError(quiz: Quiz, now: Date): string | null {
  if (quiz.availableFrom && now < new Date(quiz.availableFrom)) return 'This quiz is not available yet';
  if (quiz.availableUntil && now > new Date(quiz.availableUntil)) return 'This quiz is no longer available';
  return null;
}

export async function startAttempt(
  actor: Actor,
  quizId: string,
  now: Date = new Date(),
): Promise<Result<{ attempt: StudentQuizAttempt; quiz: ReturnType<typeof toPublicQuiz>; serverNow: string }>> {
  if (actor.role !== 'student') return forbidden('Only students can start a quiz');
  const quiz = await getQuizById(quizId);
  if (!quiz) return notFound('Quiz');
  if (quiz.status !== 'published') return badRequest('This quiz is not published yet');
  const windowError = availabilityError(quiz, now);
  if (windowError) return badRequest(windowError);
  if (!(await isEnrolled(actor.id, quiz.courseId))) {
    return forbidden('You are not enrolled in this course');
  }
  const existing = await getInProgressAttempt(quizId, actor.id);
  if (existing) {
    return { attempt: toStudentAttempt(existing), quiz: toPublicQuiz(quiz), serverNow: now.toISOString() };
  }
  const submitted = await countSubmittedAttempts(quizId, actor.id);
  if (submitted >= quiz.attemptsAllowed) {
    return badRequest('You have used all attempts for this quiz');
  }
  const dueAt = quiz.timeLimitMin ? new Date(now.getTime() + quiz.timeLimitMin * 60_000) : null;
  const attempt = await createAttempt({ quizId, studentId: actor.id, dueAt, startedAt: now });
  return { attempt: toStudentAttempt(attempt), quiz: toPublicQuiz(quiz), serverNow: now.toISOString() };
}

export async function getAttemptForStudent(
  actor: Actor,
  attemptId: string,
  now: Date = new Date(),
): Promise<Result<{ attempt: StudentQuizAttempt; quiz: ReturnType<typeof toPublicQuiz>; serverNow: string }>> {
  if (actor.role !== 'student') return forbidden('Only students can view attempts');
  const attempt = await getAttemptById(attemptId);
  if (!attempt) return notFound('Attempt');
  if (attempt.studentId !== actor.id) return forbidden('This attempt belongs to another student');
  const quiz = await getQuizById(attempt.quizId);
  if (!quiz) return notFound('Quiz');
  return { attempt: toStudentAttempt(attempt), quiz: toPublicQuiz(quiz), serverNow: now.toISOString() };
}

export interface SubmitAnswerInput {
  questionId: string;
  selectedOptionIds?: string[];
  textAnswer?: string;
}

export interface SubmitResult {
  attempt: StudentQuizAttempt;
  /** Null when the teacher hid results from students. */
  score: number | null;
  totalPoints: number | null;
  passed: boolean | null;
  /** Per-question correctness, only when results are visible. */
  perQuestion?: Array<{ questionId: string; isCorrect: boolean | null; pointsAwarded: number }>;
  /** Correct answers, only when the teacher allows showing them. */
  correctAnswers?: Array<{ questionId: string; correctOptionIds?: string[]; correctText?: string }>;
}

export async function submitAttempt(
  actor: Actor,
  attemptId: string,
  answers: SubmitAnswerInput[],
  now: Date = new Date(),
): Promise<Result<{ result: SubmitResult }>> {
  if (actor.role !== 'student') return forbidden('Only students can submit a quiz');
  const attempt = await getAttemptById(attemptId);
  if (!attempt) return notFound('Attempt');
  if (attempt.studentId !== actor.id) return forbidden('This attempt belongs to another student');
  if (attempt.status !== 'in_progress') return badRequest('This attempt has already been submitted');
  const quiz = await getQuizById(attempt.quizId);
  if (!quiz) return notFound('Quiz');
  const questions = quiz.questions ?? [];

  // Exact-selection enforcement (server-side, before anything is saved).
  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    if (!question) return badRequest(`Unknown question: ${answer.questionId}`);
    const required = requiredSelectionCount(question.type);
    const selected = answer.selectedOptionIds ?? [];
    if (question.type === 'fill_blank') {
      if (selected.length > 0) return badRequest(`Q${question.position}: fill-in-the-blank takes text, not options`);
      continue;
    }
    if (required !== null && selected.length !== required) {
      return badRequest(
        `Q${question.position} requires exactly ${required} selection${required === 1 ? '' : 's'} (got ${selected.length})`,
      );
    }
    if (required === null && selected.length === 0) {
      return badRequest(`Q${question.position}: select at least one option`);
    }
    const validIds = new Set(question.options.map((o) => o.id));
    if (selected.some((id) => !validIds.has(id))) {
      return badRequest(`Q${question.position}: unknown option selected`);
    }
  }

  const submittedLate = attempt.dueAt ? now.getTime() > new Date(attempt.dueAt).getTime() + GRACE_MS : false;
  const timeSpentSec = Math.max(0, Math.floor((now.getTime() - new Date(attempt.startedAt).getTime()) / 1000));

  for (const answer of answers) {
    await saveAnswer({
      attemptId,
      questionId: answer.questionId,
      selectedOptionIds: answer.selectedOptionIds ?? [],
      textAnswer: answer.textAnswer ?? null,
    });
  }
  const answerMap = new Map(
    answers.map((a) => [a.questionId, { selectedOptionIds: a.selectedOptionIds ?? [], textAnswer: a.textAnswer ?? null }]),
  );
  const graded = gradeAttempt(questions, answerMap, quiz.scoringPolicy);
  const saved = await listAttemptsByStudent(quiz.id, actor.id);
  const fresh = saved.find((a) => a.id === attemptId);
  if (!fresh) return notFound('Attempt');
  for (const answer of fresh.answers ?? []) {
    const result = graded.results.get(answer.questionId);
    if (result) {
      await gradeAnswer(answer.id, {
        isCorrect: result.isCorrect,
        pointsAwarded: result.pointsAwarded,
        needsManualReview: result.needsManualReview,
      });
    }
  }
  const updated = await updateAttempt(attemptId, {
    status: 'submitted',
    submittedAt: now,
    score: graded.score,
    totalPoints: graded.totalPoints,
    timeSpentSec,
    submittedLate,
  });
  if (!updated) return notFound('Attempt');
  await audit(actor.id, 'quiz.submit', quiz.id, `${quiz.title}: ${graded.score}/${graded.totalPoints}${submittedLate ? ' (late)' : ''}`);

  const result: SubmitResult = {
    attempt: toStudentAttempt(updated),
    score: null,
    totalPoints: null,
    passed: null,
  };
  if (quiz.showResultsToStudents) {
    result.score = graded.score;
    result.totalPoints = graded.totalPoints;
    result.passed = quiz.passMark === undefined || quiz.passMark === null ? null : graded.score >= (graded.totalPoints * quiz.passMark) / 100;
    result.perQuestion = questions.map((q) => {
      const g = graded.results.get(q.id)!;
      return { questionId: q.id, isCorrect: g.isCorrect, pointsAwarded: g.pointsAwarded };
    });
    if (quiz.showCorrectAnswers) {
      result.correctAnswers = questions.map((q) => ({
        questionId: q.id,
        ...(q.type === 'fill_blank'
          ? { correctText: q.correctText }
          : { correctOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id) }),
      }));
    }
  }
  return { result };
}

export async function listMyAttempts(
  actor: Actor,
  quizId: string,
): Promise<Result<{ attempts: StudentQuizAttempt[]; quiz: ReturnType<typeof toPublicQuiz> }>> {
  if (actor.role !== 'student') return forbidden('Only students can list attempts');
  const quiz = await getQuizById(quizId);
  if (!quiz) return notFound('Quiz');
  const attempts = await listAttemptsByStudent(quizId, actor.id);
  return { attempts: attempts.map(toStudentAttempt), quiz: toPublicQuiz(quiz) };
}

// ---------------------------------------------------------------------------
// Teacher: analytics
// ---------------------------------------------------------------------------

export interface QuestionAnalytics {
  questionId: string;
  position: number;
  prompt: string;
  type: QuizQuestionType;
  points: number;
  attempts: number;
  correct: number;
  accuracy: number | null;
}

export interface StudentAnalytics {
  studentId: string;
  studentName: string;
  attempts: number;
  bestScore: number | null;
  latestScore: number | null;
  totalPoints: number;
  submittedAt?: string;
}

export interface QuizAnalytics {
  quizId: string;
  title: string;
  totalPoints: number;
  submittedAttempts: number;
  uniqueStudents: number;
  averageScore: number | null;
  passCount: number;
  passRate: number | null;
  perQuestion: QuestionAnalytics[];
  perStudent: StudentAnalytics[];
  byTopic: Array<{ topic: string; attempts: number; correct: number; accuracy: number | null }>;
}

export async function getQuizAnalytics(actor: Actor, quizId: string): Promise<Result<{ analytics: QuizAnalytics }>> {
  const loaded = await loadQuizForManagement(actor, quizId);
  if ('error' in loaded) return loaded;
  const quiz = loaded.quiz;
  const questions = quiz.questions ?? [];
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
  const attempts = (await listAttemptsByQuiz(quizId)).filter((a) => a.status === 'submitted');

  const perQuestion: QuestionAnalytics[] = questions.map((q) => {
    let count = 0;
    let correct = 0;
    for (const attempt of attempts) {
      const answer = (attempt.answers ?? []).find((a) => a.questionId === q.id);
      if (!answer) continue;
      count++;
      if (answer.isCorrect) correct++;
    }
    return {
      questionId: q.id,
      position: q.position,
      prompt: q.prompt,
      type: q.type,
      points: q.points,
      attempts: count,
      correct,
      accuracy: count > 0 ? Math.round((correct / count) * 1000) / 10 : null,
    };
  });

  const byStudent = new Map<string, QuizAttempt[]>();
  for (const attempt of attempts) {
    const list = byStudent.get(attempt.studentId) ?? [];
    list.push(attempt);
    byStudent.set(attempt.studentId, list);
  }
  const perStudent: StudentAnalytics[] = [];
  for (const [studentId, studentAttempts] of byStudent) {
    const user = await getUserById(studentId);
    const scores = studentAttempts.map((a) => a.score ?? 0);
    const latest = [...studentAttempts].sort((a, b) => (a.submittedAt ?? '') < (b.submittedAt ?? '') ? 1 : -1)[0];
    perStudent.push({
      studentId,
      studentName: user?.name ?? studentId,
      attempts: studentAttempts.length,
      bestScore: scores.length > 0 ? Math.max(...scores) : null,
      latestScore: latest?.score ?? null,
      totalPoints,
      submittedAt: latest?.submittedAt,
    });
  }
  perStudent.sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0));

  const scores = attempts.map((a) => a.score ?? 0);
  const averageScore = scores.length > 0 ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10 : null;
  const passCount =
    quiz.passMark === undefined || quiz.passMark === null
      ? 0
      : attempts.filter((a) => (a.score ?? 0) >= (totalPoints * quiz.passMark!) / 100).length;

  const topicMap = new Map<string, { attempts: number; correct: number }>();
  for (const q of questions) {
    const topic = q.topic ?? 'Untagged';
    const entry = topicMap.get(topic) ?? { attempts: 0, correct: 0 };
    const stat = perQuestion.find((p) => p.questionId === q.id)!;
    entry.attempts += stat.attempts;
    entry.correct += stat.correct;
    topicMap.set(topic, entry);
  }
  const byTopic = [...topicMap.entries()]
    .map(([topic, v]) => ({
      topic,
      attempts: v.attempts,
      correct: v.correct,
      accuracy: v.attempts > 0 ? Math.round((v.correct / v.attempts) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.attempts - a.attempts);

  return {
    analytics: {
      quizId: quiz.id,
      title: quiz.title,
      totalPoints,
      submittedAttempts: attempts.length,
      uniqueStudents: byStudent.size,
      averageScore,
      passCount,
      passRate: attempts.length > 0 && quiz.passMark !== undefined && quiz.passMark !== null ? Math.round((passCount / attempts.length) * 1000) / 10 : null,
      perQuestion,
      perStudent,
      byTopic,
    },
  };
}
