/**
 * Quiz text-import parser tests (Phase 4, Module 8).
 *
 * The format contract: the sample text the app shows teachers
 * (QUIZ_TEXT_IMPORT_SAMPLE) must parse back into exactly its
 * questions, with the right types, options, answers and explanations,
 * and no warnings — the sample and the parser always agree. The
 * remaining tests cover the "never silently guess" rule: every
 * malformed input must be flagged, not guessed. A few regression
 * tests for the legacy text format (parseQuizText) are kept, since
 * both parsers share the same validation conventions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuizText, parseQuizTextImport } from '../lib/services/quiz-parser';
import { QUIZ_AI_PROMPT, QUIZ_TEXT_IMPORT_SAMPLE } from '../lib/services/quiz-text-format';

// ---------------------------------------------------------------------------
// Format contract: the sample parses cleanly
// ---------------------------------------------------------------------------

test('sample format round-trips: parses into its 3 questions with 0 warnings', () => {
  const result = parseQuizTextImport(QUIZ_TEXT_IMPORT_SAMPLE);
  assert.equal(result.isScanned, false);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.questions.length, 3);
  assert.equal(result.answerKeyEntries, 3);

  const [q1, q2, q3] = result.questions;
  assert.equal(q1.type, 'mcq');
  assert.equal(q1.prompt, 'What is the capital of France?');
  assert.deepEqual(q1.options.map((o) => o.text), ['London', 'Paris', 'Berlin', 'Madrid']);
  assert.deepEqual(q1.options.filter((o) => o.isCorrect).map((o) => o.letter), ['B']);
  assert.equal(q1.explanation, 'Paris is the capital of France.');

  assert.equal(q2.type, 'fill_blank');
  assert.equal(q2.prompt, 'The chemical symbol for water is ______.');
  assert.equal(q2.correctText, 'H2O');
  assert.equal(q2.explanation, 'H stands for hydrogen and O stands for oxygen.');

  assert.equal(q3.type, 'choose_two');
  assert.equal(q3.prompt, 'Choose exactly two primary colours.');
  assert.deepEqual(q3.options.filter((o) => o.isCorrect).map((o) => o.letter), ['A', 'C']);
  assert.equal(q3.explanation, 'Red and blue are primary colours. Green and yellow are not.');
});

test('the AI prompt tells the teacher the exact format (placeholders + rules)', () => {
  assert.ok(QUIZ_AI_PROMPT.includes('[TOPIC]'));
  assert.ok(QUIZ_AI_PROMPT.includes('[TOTAL QUESTIONS]'));
  assert.ok(QUIZ_AI_PROMPT.includes('[DIFFICULTY'));
  assert.ok(QUIZ_AI_PROMPT.includes('[ADDITIONAL INSTRUCTIONS]'));
  assert.ok(QUIZ_AI_PROMPT.includes('Question 1:'));
  assert.ok(QUIZ_AI_PROMPT.includes('Correct Answer:'));
  assert.ok(QUIZ_AI_PROMPT.includes('Explanation:'));
});

// ---------------------------------------------------------------------------
// Format variations the import must accept
// ---------------------------------------------------------------------------

test('option markers A) and A: are accepted, as is a multi-line prompt', () => {
  const result = parseQuizTextImport(`Question 1: What is 2 + 2?
It is the simplest sum
in arithmetic.
A) 3
B) 4
C) 5
D) 6
Correct Answer: B
Explanation: 2 + 2 is 4.
`);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].prompt, 'What is 2 + 2? It is the simplest sum in arithmetic.');
  assert.equal(result.questions[0].type, 'mcq');
  assert.deepEqual(result.questions[0].options.filter((o) => o.isCorrect).map((o) => o.letter), ['B']);
});

test('A: markers and a multi-line explanation are accepted', () => {
  const result = parseQuizTextImport(`Question 1: Which planet is known as the Red Planet?
A: Earth
B: Mars
C: Venus
Correct Answer: B
Explanation: Mars looks red
because of iron oxide on its surface.
`);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.questions[0].explanation, 'Mars looks red because of iron oxide on its surface.');
});

test('a title line before the first question is ignored, not parsed as a question', () => {
  const result = parseQuizTextImport(`Quiz about France

Question 1: What is the capital of France?
A. London
B. Paris
Correct Answer: B
Explanation: Paris is the capital.
`);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.questions.length, 1);
});

test('several correct letters mean checkbox; "Correct Answer: B. Paris" reads as letter B', () => {
  const multi = parseQuizTextImport(`Question 1: Which of these are fruits?
A. Apple
B. Carrot
C. Banana
D. Potato
Correct Answer: A, C
Explanation: Apples and bananas are fruits.
`);
  assert.equal(multi.questions[0].type, 'checkbox');
  assert.deepEqual(multi.questions[0].options.filter((o) => o.isCorrect).map((o) => o.letter), ['A', 'C']);
  assert.deepEqual(multi.warnings, []);

  const letterText = parseQuizTextImport(`Question 1: What is the capital of France?
A. London
B. Paris
Correct Answer: B. Paris
Explanation: Paris is the capital.
`);
  assert.equal(letterText.questions[0].type, 'mcq');
  assert.deepEqual(letterText.questions[0].options.filter((o) => o.isCorrect).map((o) => o.letter), ['B']);
  assert.deepEqual(letterText.warnings, []);
});

test('without a type tag, "Correct Answer: A, B" is a valid checkbox — the type comes from the answer', () => {
  const result = parseQuizTextImport(`Question 1: Pick two.
A. One
B. Two
C. Three
Correct Answer: A, B
Explanation: One and two.
`);
  assert.equal(result.questions[0].type, 'checkbox');
  assert.deepEqual(result.warnings, []);
});

test('an explanation is optional — a question without one still imports cleanly', () => {
  const result = parseQuizTextImport(`Question 1: What is 2 + 2?
A. 3
B. 4
Correct Answer: B
`);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.questions[0].explanation, undefined);
});

test('a [Choose Three] tag and "(2 points)" in the header are honoured', () => {
  const result = parseQuizTextImport(`Question 1 [Choose Three] (2 points): Pick three colours of the French flag.
A. Red
B. Green
C. Blue
D. White
Correct Answer: A, C, D
Explanation: The French flag is blue, white and red.
`);
  assert.equal(result.questions[0].type, 'choose_three');
  assert.equal(result.questions[0].points, 2);
  assert.deepEqual(result.warnings, []);
});

// ---------------------------------------------------------------------------
// "Never silently guess": malformed input is flagged
// ---------------------------------------------------------------------------

test('missing "Correct Answer:" line is flagged, question kept and marked', () => {
  const result = parseQuizTextImport(`Question 1: What is 2 + 2?
A. 3
B. 4
C. 5
D. 6
`);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].needsReview, true);
  assert.ok(result.warnings.some((w) => w.message.includes('no "Correct Answer:" line')));
});

test('duplicate question numbers keep the first copy and raise an error warning', () => {
  const result = parseQuizTextImport(`Question 1: First?
A. Yes
B. No
Correct Answer: A
Explanation: First.

Question 1: Second?
A. Yes
B. No
Correct Answer: A
Explanation: Second.
`);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].prompt, 'First?');
  assert.ok(result.warnings.some((w) => w.severity === 'error' && w.message.includes('Duplicate question number')));
  assert.equal(result.questions[0].needsReview, true);
});

test('Choose Two with three correct options is flagged, not silently fixed', () => {
  const result = parseQuizTextImport(`Question 1: Choose exactly two.
A. One
B. Two
C. Three
D. Four
Correct Answer: A, B, C
Explanation: Three were marked.
`);
  assert.equal(result.questions[0].type, 'choose_two');
  assert.equal(result.questions[0].needsReview, true);
  assert.ok(result.warnings.some((w) => w.message.includes('exactly 2 required')));
});

test('correct answer naming a non-existent option is flagged', () => {
  const result = parseQuizTextImport(`Question 1: Pick one.
A. One
B. Two
Correct Answer: Z
Explanation: There is no Z.
`);
  assert.ok(result.warnings.some((w) => w.message.includes('do not exist')));
  assert.equal(result.questions[0].needsReview, true);
});

test('question with fewer than two options is flagged', () => {
  const result = parseQuizTextImport(`Question 1: Only one option?
A. The only option
Correct Answer: A
Explanation: Only one.
`);
  assert.ok(result.warnings.some((w) => w.message.includes('at least 2 are needed')));
});

test('MCQ with two correct options in the answer is flagged (explicit [MCQ] tag)', () => {
  const result = parseQuizTextImport(`Question 1 [MCQ]: Pick one.
A. One
B. Two
C. Three
Correct Answer: A, B
Explanation: Two were marked.
`);
  assert.ok(result.warnings.some((w) => w.message.includes('more than one option correct')));
  assert.equal(result.questions[0].needsReview, true);
});

test('fill-in-the-blank without a blank marker is flagged', () => {
  const result = parseQuizTextImport(`Question 1: What is the chemical symbol for water?
Correct Answer: H2O
Explanation: Water is H2O.
`);
  assert.equal(result.questions[0].type, 'fill_blank');
  assert.equal(result.questions[0].correctText, 'H2O');
  assert.ok(result.warnings.some((w) => w.message.includes('no blank')));
});

test('empty paste and text with no questions are errors, not empty quizzes', () => {
  const empty = parseQuizTextImport('   \n\n  ');
  assert.equal(empty.questions.length, 0);
  assert.ok(empty.warnings.some((w) => w.severity === 'error'));

  const noQuestions = parseQuizTextImport(`This is a document about cats.
It has no questions at all.
`);
  assert.equal(noQuestions.questions.length, 0);
  assert.ok(noQuestions.warnings.some((w) => w.severity === 'error' && w.message.includes('No questions were found')));
});

test('text over the size limit is rejected with an error', () => {
  const big = `Question 1: What is 2 + 2?\nA. 3\nB. 4\nCorrect Answer: B\nExplanation: Four.\n`.repeat(20000);
  const result = parseQuizTextImport(big);
  assert.equal(result.questions.length, 0);
  assert.ok(result.warnings.some((w) => w.severity === 'error' && w.message.includes('too long')));
});

// ---------------------------------------------------------------------------
// Legacy text format (parseQuizText) — regression cover
// ---------------------------------------------------------------------------

test('legacy format: missing answer-key entry is flagged, question kept and marked', () => {
  const result = parseQuizText(`Q1 [MCQ] (2 points)
What is 2 + 2?
A. 3
B. 4
C. 5
D. 6

Answer Key:
`);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].needsReview, true);
  assert.ok(result.warnings.some((w) => w.message.includes('no answer-key entry')));
});

test('legacy format: duplicate question numbers keep the first copy', () => {
  const result = parseQuizText(`Q1 [MCQ] (1 point)
First?
A. Yes
B. No

Q1 [MCQ] (1 point)
Second?
A. Yes
B. No

Answer Key:
Q1: A
`);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].prompt, 'First?');
  assert.ok(result.warnings.some((w) => w.severity === 'error' && w.message.includes('Duplicate question number')));
});

test('legacy format: missing type tag is inferred from the key and flagged for confirmation', () => {
  const result = parseQuizText(`Q1 (2 points)
What is the capital of Japan?
A. Seoul
B. Tokyo
C. Beijing
D. Bangkok

Answer Key:
Q1: B
`);
  assert.equal(result.questions[0].type, 'mcq');
  assert.equal(result.questions[0].needsReview, true);
  assert.ok(result.questions[0].reviewNote?.includes('inferred'));
});
