/**
 * Quiz parser tests (Phase 5).
 *
 * The round-trip test is the format contract: the sample template the
 * app generates must parse back into exactly the 11 questions it was
 * built from, with the right types, options, and answers, and no
 * warnings. The remaining tests cover the "never silently guess" rule:
 * every malformed input must be flagged, not guessed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPdfText, parseQuizText, parseQuizPdf } from '../lib/services/quiz-parser';
import { generateSampleQuizPdf, SAMPLE_QUIZ_QUESTIONS } from '../lib/services/quiz-sample-pdf';

test('sample template round-trips: generate -> extract -> parse recovers all 11 questions', async () => {
  const pdf = generateSampleQuizPdf();
  assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF');
  const { text, pageCount } = await extractPdfText(pdf);
  assert.ok(pageCount >= 1);
  const result = parseQuizText(text);
  assert.equal(result.isScanned, false);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.questions.length, 11);
  assert.equal(result.answerKeyEntries, 11);

  const byNumber = new Map(result.questions.map((q) => [q.number, q]));
  for (const sample of SAMPLE_QUIZ_QUESTIONS) {
    const parsed = byNumber.get(sample.number);
    assert.ok(parsed, `Q${sample.number} missing`);
    assert.equal(parsed.prompt, sample.prompt);
    if (sample.options) {
      assert.deepEqual(
        parsed.options.map((o) => o.text),
        sample.options,
      );
      const correctLetters = parsed.options.filter((o) => o.isCorrect).map((o) => o.letter);
      assert.deepEqual(correctLetters, sample.answerKey.split(/[\s,]+/).filter(Boolean));
    } else {
      assert.equal(parsed.correctText, sample.answerKey);
    }
  }
  // Types.
  assert.equal(byNumber.get(1)!.type, 'mcq');
  assert.equal(byNumber.get(4)!.type, 'fill_blank');
  assert.equal(byNumber.get(6)!.type, 'checkbox');
  assert.equal(byNumber.get(8)!.type, 'choose_two');
  assert.equal(byNumber.get(10)!.type, 'choose_three');
});

test('parseQuizPdf end-to-end returns text + parsed questions', async () => {
  const pdf = generateSampleQuizPdf();
  const result = await parseQuizPdf(pdf);
  assert.equal(result.questions.length, 11);
  assert.ok(result.text.includes('Answer Key'));
  assert.equal(result.isScanned, false);
});

test('missing answer-key entry is flagged, question kept and marked for review', () => {
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

test('duplicate question numbers keep the first copy and raise an error warning', () => {
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
  assert.equal(result.questions[0].needsReview, true);
});

test('Choose Two with three correct options in the key is flagged, not silently fixed', () => {
  const result = parseQuizText(`Q1 [Choose Two] (2 points)
Pick two:
A. One
B. Two
C. Three
D. Four

Answer Key:
Q1: A, B, C
`);
  assert.equal(result.questions[0].type, 'choose_two');
  assert.equal(result.questions[0].needsReview, true);
  assert.ok(result.warnings.some((w) => w.message.includes('exactly 2 required')));
});

test('missing type tag is inferred from the key and flagged for confirmation', () => {
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

test('unknown type tag falls back to inference with a warning', () => {
  const result = parseQuizText(`Q1 [Essay] (3 points)
Explain photosynthesis.
A. Option A
B. Option B

Answer Key:
Q1: A
`);
  assert.equal(result.questions[0].type, 'mcq');
  assert.ok(result.warnings.some((w) => w.message.includes('Unknown question-type tag')));
});

test('answer-key entry for a missing question is flagged', () => {
  const result = parseQuizText(`Q1 [MCQ] (1 point)
One?
A. Yes
B. No

Answer Key:
Q1: A
Q9: B
`);
  assert.ok(result.warnings.some((w) => w.message.includes('Q9') && w.message.includes('no such question')));
});

test('fill-in-the-blank without a blank marker is flagged', () => {
  const result = parseQuizText(`Q1 [Fill in the blank] (1 point)
What is the chemical symbol for water?
Answer Key:
Q1: H2O
`);
  assert.equal(result.questions[0].type, 'fill_blank');
  assert.equal(result.questions[0].correctText, 'H2O');
  assert.ok(result.warnings.some((w) => w.message.includes('no blank')));
});

test('MCQ with two correct options in the key is flagged', () => {
  const result = parseQuizText(`Q1 [MCQ] (1 point)
Pick one:
A. One
B. Two
C. Three

Answer Key:
Q1: A, B
`);
  assert.ok(result.warnings.some((w) => w.message.includes('more than one option correct')));
  assert.equal(result.questions[0].needsReview, true);
});

test('question with fewer than two options is flagged', () => {
  const result = parseQuizText(`Q1 [MCQ] (1 point)
Only one option?
A. The only option

Answer Key:
Q1: A
`);
  assert.ok(result.warnings.some((w) => w.message.includes('at least 2 are needed')));
});

test('answer key naming a non-existent option is flagged', () => {
  const result = parseQuizText(`Q1 [MCQ] (1 point)
Pick one:
A. One
B. Two

Answer Key:
Q1: Z
`);
  assert.ok(result.warnings.some((w) => w.message.includes('do not exist')));
  assert.equal(result.questions[0].needsReview, true);
});

test('no questions in the PDF is an error, not an empty quiz', () => {
  const result = parseQuizText(`This is a document about cats.
It has no questions at all.
Answer Key:
Q1: A
`);
  assert.equal(result.questions.length, 0);
  assert.ok(result.warnings.some((w) => w.severity === 'error'));
});

test('near-empty text is flagged as scanned (no OCR available)', () => {
  const result = parseQuizText('   \n\n  ');
  assert.equal(result.isScanned, true);
  assert.equal(result.questions.length, 0);
  assert.ok(result.warnings[0].message.includes('scanned'));
});
