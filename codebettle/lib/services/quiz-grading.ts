/**
 * Quiz grading (Phase 5) — pure functions, no database.
 *
 * Rules (master prompt §6G):
 * - MCQ: exactly one selection; correct iff it is the marked option.
 * - Fill in the blank: the student's text is normalised (trimmed,
 *   lower-cased, whitespace collapsed) and compared with the key text
 *   and any accepted alternates.
 * - Checkbox / Choose Two / Choose Three: the selected set must equal
 *   the correct set. Under the default `exact` policy a wrong set
 *   scores 0. Under the `partial` policy a question scores
 *   points * max(0, correctSelected - wrongSelected) / correctTotal,
 *   rounded to the nearest whole point — the policy is the teacher's
 *   explicit choice on the quiz, never a silent default change.
 * - A question with no answer key (no correct option / no key text)
 *   cannot be auto-graded: it scores 0 and is flagged
 *   needsManualReview so the teacher can grade it by hand.
 * - Selection-count violations (e.g. one option picked for Choose Two)
 *   score 0 here; the submit path rejects them with 400 first, so a
 *   graded attempt should never contain one — the grader stays safe
 *   even if it does.
 */
import type { QuizQuestion, QuizScoringPolicy } from '../db/types';

export interface AnswerInput {
  selectedOptionIds: string[];
  textAnswer?: string | null;
}

export interface GradeResult {
  /** null when the question has no key and needs a teacher's judgement. */
  isCorrect: boolean | null;
  pointsAwarded: number;
  needsManualReview: boolean;
}

/** Normalise fill-in-the-blank text for comparison. */
export function normalizeFillAnswer(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function gradeQuestion(
  question: QuizQuestion,
  answer: AnswerInput,
  policy: QuizScoringPolicy = 'exact',
): GradeResult {
  const points = question.points;
  if (question.type === 'fill_blank') {
    const key = question.correctText ? normalizeFillAnswer(question.correctText) : '';
    const accepted = (question.acceptedAnswers ?? []).map(normalizeFillAnswer);
    if (!key && accepted.length === 0) {
      return { isCorrect: null, pointsAwarded: 0, needsManualReview: true };
    }
    const given = normalizeFillAnswer(answer.textAnswer ?? '');
    const correct = given.length > 0 && (given === key || accepted.includes(given));
    return { isCorrect: correct, pointsAwarded: correct ? points : 0, needsManualReview: false };
  }

  const correctIds = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id));
  if (correctIds.size === 0) {
    return { isCorrect: null, pointsAwarded: 0, needsManualReview: true };
  }
  const selected = new Set(answer.selectedOptionIds);
  const correctSelected = [...selected].filter((id) => correctIds.has(id)).length;
  const wrongSelected = selected.size - correctSelected;
  const exactMatch = selected.size === correctIds.size && correctSelected === correctIds.size;

  if (policy === 'partial' && (question.type === 'checkbox' || question.type === 'choose_two' || question.type === 'choose_three')) {
    const ratio = Math.max(0, correctSelected - wrongSelected) / correctIds.size;
    const awarded = Math.round(points * ratio);
    return { isCorrect: exactMatch, pointsAwarded: awarded, needsManualReview: false };
  }
  return { isCorrect: exactMatch, pointsAwarded: exactMatch ? points : 0, needsManualReview: false };
}

export interface AttemptGrade {
  results: Map<string, GradeResult>;
  score: number;
  totalPoints: number;
  needsManualReview: boolean;
}

/** Grade a whole attempt. `answers` maps questionId -> the student's answer. */
export function gradeAttempt(
  questions: QuizQuestion[],
  answers: Map<string, AnswerInput>,
  policy: QuizScoringPolicy = 'exact',
): AttemptGrade {
  const results = new Map<string, GradeResult>();
  let score = 0;
  let totalPoints = 0;
  let needsManualReview = false;
  for (const question of questions) {
    totalPoints += question.points;
    const answer = answers.get(question.id) ?? { selectedOptionIds: [] };
    const result = gradeQuestion(question, answer, policy);
    results.set(question.id, result);
    score += result.pointsAwarded;
    if (result.needsManualReview) needsManualReview = true;
  }
  return { results, score, totalPoints, needsManualReview };
}
