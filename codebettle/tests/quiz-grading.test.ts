/**
 * Quiz grading tests (Phase 5) — pure functions, all five question
 * types, both scoring policies, fill-in-the-blank normalisation, and
 * the no-key -> manual-review rule.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeQuestion, gradeAttempt, normalizeFillAnswer } from '../lib/services/quiz-grading';
import type { QuizQuestion } from '../lib/db/types';

function mcq(id: string, correctIndex: number): QuizQuestion {
  return {
    id,
    quizId: 'quiz-1',
    type: 'mcq',
    position: 1,
    prompt: 'Pick one',
    points: 2,
    acceptedAnswers: [],
    needsReview: false,
    options: ['A', 'B', 'C', 'D'].map((text, i) => ({
      id: `opt-${id}-${i}`,
      questionId: id,
      text,
      position: i + 1,
      isCorrect: i === correctIndex,
    })),
  };
}

function fillBlank(id: string, correctText: string, accepted: string[] = []): QuizQuestion {
  return {
    id,
    quizId: 'quiz-1',
    type: 'fill_blank',
    position: 1,
    prompt: 'The answer is ______.',
    points: 3,
    correctText,
    acceptedAnswers: accepted,
    needsReview: false,
    options: [],
  };
}

function multi(id: string, type: 'checkbox' | 'choose_two' | 'choose_three', correct: number[], points = 4): QuizQuestion {
  return {
    id,
    quizId: 'quiz-1',
    type,
    position: 1,
    prompt: 'Select',
    points,
    acceptedAnswers: [],
    needsReview: false,
    options: ['A', 'B', 'C', 'D'].map((text, i) => ({
      id: `opt-${id}-${i}`,
      questionId: id,
      text,
      position: i + 1,
      isCorrect: correct.includes(i),
    })),
  };
}

test('MCQ: correct single selection scores full, wrong scores 0', () => {
  const q = mcq('q1', 1);
  assert.deepEqual(gradeQuestion(q, { selectedOptionIds: ['opt-q1-1'] }), { isCorrect: true, pointsAwarded: 2, needsManualReview: false });
  assert.deepEqual(gradeQuestion(q, { selectedOptionIds: ['opt-q1-0'] }), { isCorrect: false, pointsAwarded: 0, needsManualReview: false });
  assert.deepEqual(gradeQuestion(q, { selectedOptionIds: [] }), { isCorrect: false, pointsAwarded: 0, needsManualReview: false });
});

test('fill-in-the-blank: normalisation (case, spaces) and accepted alternates', () => {
  const q = fillBlank('q1', 'H2O', ['water']);
  assert.equal(gradeQuestion(q, { selectedOptionIds: [], textAnswer: '  h2o ' }).isCorrect, true);
  assert.equal(gradeQuestion(q, { selectedOptionIds: [], textAnswer: 'WATER' }).isCorrect, true);
  assert.equal(gradeQuestion(q, { selectedOptionIds: [], textAnswer: 'H20' }).isCorrect, false);
  assert.equal(gradeQuestion(q, { selectedOptionIds: [], textAnswer: '' }).isCorrect, false);
  assert.equal(normalizeFillAnswer('  New   York '), 'new york');
});

test('checkbox: exact set match only under the exact policy', () => {
  const q = multi('q1', 'checkbox', [0, 1, 3]);
  assert.deepEqual(gradeQuestion(q, { selectedOptionIds: ['opt-q1-0', 'opt-q1-1', 'opt-q1-3'] }), { isCorrect: true, pointsAwarded: 4, needsManualReview: false });
  assert.equal(gradeQuestion(q, { selectedOptionIds: ['opt-q1-0', 'opt-q1-1'] }).pointsAwarded, 0);
  assert.equal(gradeQuestion(q, { selectedOptionIds: ['opt-q1-0', 'opt-q1-1', 'opt-q1-2', 'opt-q1-3'] }).pointsAwarded, 0);
});

test('checkbox: partial policy gives proportional credit, never negative', () => {
  const q = multi('q1', 'checkbox', [0, 1, 3]);
  // 2 of 3 correct, none wrong -> 4 * 2/3 = 2.67 -> 3
  assert.equal(gradeQuestion(q, { selectedOptionIds: ['opt-q1-0', 'opt-q1-1'] }, 'partial').pointsAwarded, 3);
  // 2 correct + 1 wrong -> 4 * (2-1)/3 = 1.33 -> 1
  assert.equal(gradeQuestion(q, { selectedOptionIds: ['opt-q1-0', 'opt-q1-1', 'opt-q1-2'] }, 'partial').pointsAwarded, 1);
  // Only wrong -> 0 (floored)
  assert.equal(gradeQuestion(q, { selectedOptionIds: ['opt-q1-2'] }, 'partial').pointsAwarded, 0);
});

test('choose two / three: exact set match scores full, anything else 0', () => {
  const two = multi('q1', 'choose_two', [0, 2]);
  assert.equal(gradeQuestion(two, { selectedOptionIds: ['opt-q1-0', 'opt-q1-2'] }).pointsAwarded, 4);
  assert.equal(gradeQuestion(two, { selectedOptionIds: ['opt-q1-0'] }).pointsAwarded, 0);
  assert.equal(gradeQuestion(two, { selectedOptionIds: ['opt-q1-0', 'opt-q1-1'] }).pointsAwarded, 0);
  const three = multi('q2', 'choose_three', [0, 1, 2]);
  assert.equal(gradeQuestion(three, { selectedOptionIds: ['opt-q2-0', 'opt-q2-1', 'opt-q2-2'] }).pointsAwarded, 4);
  assert.equal(gradeQuestion(three, { selectedOptionIds: ['opt-q2-0', 'opt-q2-1'] }).pointsAwarded, 0);
});

test('a question with no answer key cannot be auto-graded', () => {
  const noKeyMcq = mcq('q1', -1);
  assert.deepEqual(gradeQuestion(noKeyMcq, { selectedOptionIds: ['opt-q1-0'] }), { isCorrect: null, pointsAwarded: 0, needsManualReview: true });
  const noKeyFill = fillBlank('q2', '');
  assert.deepEqual(gradeQuestion(noKeyFill, { selectedOptionIds: [], textAnswer: 'x' }), { isCorrect: null, pointsAwarded: 0, needsManualReview: true });
});

test('gradeAttempt totals points and flags manual review', () => {
  const questions = [mcq('q1', 1), fillBlank('q2', 'H2O')];
  const result = gradeAttempt(
    questions,
    new Map([
      ['q1', { selectedOptionIds: ['opt-q1-1'] }],
      ['q2', { selectedOptionIds: [], textAnswer: 'h2o' }],
    ]),
  );
  assert.equal(result.score, 5);
  assert.equal(result.totalPoints, 5);
  assert.equal(result.needsManualReview, false);

  const withNoKey = gradeAttempt(
    [mcq('q3', -1)],
    new Map([['q3', { selectedOptionIds: ['opt-q3-0'] }]]),
  );
  assert.equal(withNoKey.needsManualReview, true);
  assert.equal(withNoKey.score, 0);
});
