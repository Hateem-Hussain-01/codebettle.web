/**
 * Quiz text parsing (Phase 5 PDF format, Phase 4 Module 8 text import)
 * — pure functions, no database.
 *
 * Two input formats share one validator (`finalizeParsedQuestion`), so
 * both get the same "flag, never guess" treatment:
 *
 * 1. The legacy PDF format (`parseQuizText`), kept for the text it
 *    already parses — questions start with a line like
 *    "Q1 [MCQ] (2 points)", options are "A. …" lines, and the answers
 *    live in a trailing "Answer Key:" section. PDF *extraction* is
 *    gone (Module 8 removed the PDF upload workflow), so this parser
 *    only ever sees plain text now.
 * 2. The text-import format (`parseQuizTextImport`, Module 8) — the
 *    format teachers paste after asking any AI tool for a quiz:
 *
 *      Question 1: What is the capital of France?
 *      A. London
 *      B. Paris
 *      C. Berlin
 *      D. Madrid
 *      Correct Answer: B
 *      Explanation: Paris is the capital of France.
 *
 *    Each question carries its own "Correct Answer:" line (no separate
 *    answer-key section) and an optional "Explanation:" line, stored
 *    on the question. Option markers accept "A.", "A)" and "A:";
 *    prompts and explanations may span several lines.
 *
 * Rules both parsers follow:
 * - Question types come from the [Type] tag when present. When the tag
 *   is missing, the type is inferred from the correct answer and the
 *   prompt wording. The PDF parser flags inferred types needsReview
 *   (the tag was expected there); the text-import parser does not —
 *   inferring from "Correct Answer:" is how that format works.
 * - Missing keys, duplicate numbering, malformed options, wrong
 *   selection counts for Choose Two / Choose Three, and incomplete
 *   questions are all flagged as warnings — never silently guessed,
 *   never silently dropped.
 * - Sanitisation: control characters are stripped; text is capped.
 */
import type { ParseWarning, QuizQuestionType } from '../db/types';

export const MAX_QUIZ_TEXT_CHARS = 500_000;
/** Pasted quiz text is capped well below the PDF text cap (Module 8). */
export const MAX_QUIZ_TEXT_IMPORT_CHARS = 200_000;

export interface ParsedOption {
  letter: string;
  text: string;
  isCorrect: boolean;
}

export interface ParsedQuestion {
  number: number;
  type: QuizQuestionType;
  prompt: string;
  points: number;
  options: ParsedOption[];
  correctText?: string;
  acceptedAnswers: string[];
  /** Teacher-facing explanation, from an "Explanation:" line (text import). */
  explanation?: string;
  needsReview: boolean;
  reviewNote?: string;
}

export interface ParseResult {
  questions: ParsedQuestion[];
  warnings: ParseWarning[];
  /**
   * Legacy PDF flag: true when the input had (almost) no readable text.
   * Always false for text import — pasted text has no "scanned" state;
   * an empty paste is reported as a "no questions found" error instead.
   */
  isScanned: boolean;
  /** Number of correct-answer entries found (answer-key lines, or per-question "Correct Answer:" lines). */
  answerKeyEntries: number;
}

// ---------------------------------------------------------------------------
// Format parsing
// ---------------------------------------------------------------------------

const HEADER_RE = /^(?:Q|Question)\s*(\d+)\s*(?:\[(.*?)\])?\s*(?:\(\s*(\d+)\s*points?\s*\))?\s*$/i;
const ANSWER_KEY_HEADER_RE = /^(?:answer\s*key|answers)\s*:?\s*$/i;
const KEY_LINE_RE = /^(?:Q|Question)\s*(\d+)\s*[:\-–.]\s*(.+)$/i;
const OPTION_RE = /^([A-J])\s*[.)]\s+(.+)$/;
const SECTION_HEADING_RE = /^Section\s+\d+\s*[-–:]/i;
const LETTERS_ONLY_RE = /^[A-Z](\s*[, ]\s*[A-Z])*$/i;

function normalizeTypeTag(tag: string | undefined): QuizQuestionType | null {
  if (!tag) return null;
  const t = tag.toLowerCase();
  if (t.includes('choose three') || t.includes('choose 3')) return 'choose_three';
  if (t.includes('choose two') || t.includes('choose 2')) return 'choose_two';
  if (t.includes('fill')) return 'fill_blank';
  if (t.includes('checkbox') || t.includes('multiple-select') || t.includes('multiple select') || t.includes('select all'))
    return 'checkbox';
  if (t.includes('mcq') || t.includes('multiple choice') || t.includes('single')) return 'mcq';
  return null;
}

function parseKeyValue(raw: string): { letters: string[] } | { text: string } {
  const value = raw.trim();
  if (LETTERS_ONLY_RE.test(value)) {
    return { letters: value.toUpperCase().split(/[\s,]+/).filter(Boolean) };
  }
  return { text: value };
}

function inferType(
  prompt: string,
  key: { letters: string[] } | { text: string } | undefined,
): { type: QuizQuestionType; inferred: boolean } {
  const p = prompt.toLowerCase();
  if (p.includes('choose three') || p.includes('exactly three')) return { type: 'choose_three', inferred: true };
  if (p.includes('choose two') || p.includes('exactly two')) return { type: 'choose_two', inferred: true };
  if (!key) return { type: 'mcq', inferred: true };
  if ('text' in key) return { type: 'fill_blank', inferred: true };
  if (key.letters.length === 1) return { type: 'mcq', inferred: true };
  return { type: 'checkbox', inferred: true };
}

interface Block {
  number: number;
  typeTag?: string;
  points: number;
  lines: string[];
}

export function parseQuizText(rawText: string): ParseResult {
  const warnings: ParseWarning[] = [];
  const text = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  const nonSpace = text.replace(/\s/g, '');
  if (nonSpace.length < 20) {
    return {
      questions: [],
      warnings: [
        {
          message:
            'No readable text was found — add the questions manually below instead.',
          severity: 'error',
        },
      ],
      isScanned: true,
      answerKeyEntries: 0,
    };
  }

  const lines = text.split('\n').map((l) => l.trim());
  // Split at the answer-key section.
  let keyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (ANSWER_KEY_HEADER_RE.test(lines[i])) {
      keyStart = i;
      break;
    }
  }
  const bodyLines = keyStart >= 0 ? lines.slice(0, keyStart) : lines;
  const keyLines = keyStart >= 0 ? lines.slice(keyStart + 1) : [];

  // Parse the answer key.
  const keyByNumber = new Map<number, { letters: string[] } | { text: string }>();
  for (const line of keyLines) {
    if (!line) continue;
    const m = KEY_LINE_RE.exec(line);
    if (!m) {
      warnings.push({ message: `Answer-key line could not be read and was ignored: "${line.slice(0, 80)}"`, severity: 'warning' });
      continue;
    }
    const num = Number(m[1]);
    if (keyByNumber.has(num)) {
      warnings.push({ questionNumber: num, message: `Duplicate answer-key entry for Q${num} — the first entry was kept.`, severity: 'warning' });
      continue;
    }
    keyByNumber.set(num, parseKeyValue(m[2]));
  }

  // Parse question blocks.
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const line of bodyLines) {
    if (!line) continue;
    // A "Section N - ..." heading ends the current question and is
    // skipped — it is layout, not question text (section headings are
    // part of the template format, §6A). Anything between it and the
    // next question header is ignored the same way, because there is
    // no question to attach it to.
    if (SECTION_HEADING_RE.test(line)) {
      if (current) {
        blocks.push(current);
        current = null;
      }
      continue;
    }
    const header = HEADER_RE.exec(line);
    if (header) {
      if (current) blocks.push(current);
      current = {
        number: Number(header[1]),
        typeTag: header[2]?.trim() || undefined,
        points: header[3] ? Number(header[3]) : 1,
        lines: [],
      };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) blocks.push(current);

  if (blocks.length === 0) {
    warnings.push({
      message:
        'No questions were found in this text. Questions must start with a line like "Q1 [MCQ] (2 points)" — see the sample format on the quiz page for the expected layout.',
      severity: 'error',
    });
    return { questions: [], warnings, isScanned: false, answerKeyEntries: keyByNumber.size };
  }

  const seen = new Set<number>();
  const questions: ParsedQuestion[] = [];
  for (const block of blocks) {
    if (seen.has(block.number)) {
      warnings.push({
        questionNumber: block.number,
        message: `Duplicate question number Q${block.number} — the second copy was ignored, the first was kept.`,
        severity: 'error',
      });
      const kept = questions.find((q) => q.number === block.number);
      if (kept) {
        kept.needsReview = true;
        kept.reviewNote = 'Duplicate question number in the PDF — kept the first copy; check this question.';
      }
      continue;
    }
    seen.add(block.number);

    const options: ParsedOption[] = [];
    const promptLines: string[] = [];
    const seenLetters = new Set<string>();
    for (const line of block.lines) {
      const opt = OPTION_RE.exec(line);
      if (opt) {
        const letter = opt[1].toUpperCase();
        if (seenLetters.has(letter)) {
          warnings.push({
            questionNumber: block.number,
            message: `Option ${letter} appears twice in Q${block.number} — the second copy was ignored.`,
            severity: 'warning',
          });
          continue;
        }
        seenLetters.add(letter);
        options.push({ letter, text: opt[2].trim(), isCorrect: false });
      } else {
        promptLines.push(line);
      }
    }
    const prompt = promptLines.join(' ').replace(/\s+/g, ' ').trim();

    const key = keyByNumber.get(block.number);
    let type = normalizeTypeTag(block.typeTag);
    let inferred = false;
    if (block.typeTag && !type) {
      warnings.push({
        questionNumber: block.number,
        message: `Unknown question-type tag "[${block.typeTag}]" on Q${block.number} — the type was inferred from the answer key instead.`,
        severity: 'warning',
      });
    }
    if (!type) {
      const inferredResult = inferType(prompt, key);
      type = inferredResult.type;
      inferred = inferredResult.inferred;
    }

    const question: ParsedQuestion = {
      number: block.number,
      type,
      prompt,
      points: block.points,
      options,
      acceptedAnswers: [],
      needsReview: false,
    };
    if (inferred) {
      question.needsReview = true;
      question.reviewNote = `Question type was inferred (${type}) — please confirm it in review.`;
    }

    // Apply the answer key.
    if (!key) {
      question.needsReview = true;
      question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'No answer-key entry — set the correct answer in review.';
      warnings.push({
        questionNumber: block.number,
        message: `Q${block.number} has no answer-key entry — the correct answer must be set in review.`,
        severity: 'warning',
      });
    } else if (type === 'fill_blank') {
      if ('text' in key) {
        question.correctText = key.text;
      } else {
        question.correctText = key.letters.join(', ');
        question.needsReview = true;
        question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'The answer key looks like option letters, but this is a fill-in-the-blank — check the answer.';
        warnings.push({
          questionNumber: block.number,
          message: `Q${block.number} is a fill-in-the-blank but its answer key looks like option letters — check the answer in review.`,
          severity: 'warning',
        });
      }
    } else {
      if (!('letters' in key)) {
        question.needsReview = true;
        question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'The answer key is text, but this question has options — check the correct option.';
        warnings.push({
          questionNumber: block.number,
          message: `Q${block.number} has options but its answer key is text, not option letters — check it in review.`,
          severity: 'warning',
        });
      } else {
        const unknown = key.letters.filter((l) => !options.some((o) => o.letter === l));
        if (unknown.length > 0) {
          question.needsReview = true;
          question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + `The answer key names option(s) ${unknown.join(', ')} which do not exist.`;
          warnings.push({
            questionNumber: block.number,
            message: `Q${block.number}'s answer key names option(s) ${unknown.join(', ')} which do not exist among its options.`,
            severity: 'warning',
          });
        }
        for (const option of options) {
          option.isCorrect = key.letters.includes(option.letter);
        }
      }
    }

    // Structural validation (flag, never guess).
    if (!prompt) {
      question.needsReview = true;
      question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'No question text was found.';
      warnings.push({ questionNumber: block.number, message: `Q${block.number} has no question text.`, severity: 'warning' });
    }
    if (type !== 'fill_blank' && options.length < 2) {
      question.needsReview = true;
      question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'Fewer than 2 answer options.';
      warnings.push({
        questionNumber: block.number,
        message: `Q${block.number} has ${options.length} answer option(s) — at least 2 are needed.`,
        severity: 'warning',
      });
    }
    if (type !== 'fill_blank' && options.length > 0 && !options.some((o) => o.isCorrect)) {
      question.needsReview = true;
      question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'No correct option is marked.';
      warnings.push({
        questionNumber: block.number,
        message: `Q${block.number} has no correct option marked in the answer key.`,
        severity: 'warning',
      });
    }
    if (type === 'mcq' && options.filter((o) => o.isCorrect).length > 1) {
      question.needsReview = true;
      question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'More than one correct option for an MCQ.';
      warnings.push({
        questionNumber: block.number,
        message: `Q${block.number} is an MCQ but the answer key marks more than one option correct.`,
        severity: 'warning',
      });
    }
    if (type === 'choose_two' && options.filter((o) => o.isCorrect).length !== 2) {
      question.needsReview = true;
      question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'Choose Two needs exactly two correct options.';
      warnings.push({
        questionNumber: block.number,
        message: `Q${block.number} is Choose Two but the answer key marks ${options.filter((o) => o.isCorrect).length} option(s) correct (exactly 2 required).`,
        severity: 'warning',
      });
    }
    if (type === 'choose_three' && options.filter((o) => o.isCorrect).length !== 3) {
      question.needsReview = true;
      question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'Choose Three needs exactly three correct options.';
      warnings.push({
        questionNumber: block.number,
        message: `Q${block.number} is Choose Three but the answer key marks ${options.filter((o) => o.isCorrect).length} option(s) correct (exactly 3 required).`,
        severity: 'warning',
      });
    }
    if (type === 'fill_blank') {
      if (!/_{3,}|\[blank\]/i.test(prompt)) {
        question.needsReview = true;
        question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'The prompt has no blank (___) marker.';
        warnings.push({
          questionNumber: block.number,
          message: `Q${block.number} is a fill-in-the-blank but its prompt has no blank (___) marker.`,
          severity: 'warning',
        });
      }
      if (!question.correctText) {
        question.needsReview = true;
        question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'No correct answer text.';
        warnings.push({
          questionNumber: block.number,
          message: `Q${block.number} has no correct answer text in the answer key.`,
          severity: 'warning',
        });
      }
    }

    questions.push(question);
  }

  // Key entries with no matching question.
  for (const num of keyByNumber.keys()) {
    if (!seen.has(num)) {
      warnings.push({
        questionNumber: num,
        message: `The answer key has an entry for Q${num} but no such question was found — it was ignored.`,
        severity: 'warning',
      });
    }
  }

  questions.sort((a, b) => a.number - b.number);
  return { questions, warnings, isScanned: false, answerKeyEntries: keyByNumber.size };
}

// ---------------------------------------------------------------------------
// Text import (Module 8) — paste AI-generated quiz text, no PDF.
// ---------------------------------------------------------------------------

/**
 * A "Question N: …" header. The prompt may start on the same line, and
 * an optional "[Type]" tag / "(N points)" may follow the number — both
 * are honoured when present, never required.
 */
const IMPORT_HEADER_RE = /^(?:Question|Q)\s*(\d+)\s*(?:\[(.*?)\])?\s*(?:\(\s*(\d+)\s*points?\s*\))?\s*[-–:.]?\s*(.*)$/i;
/** Option markers: "A.", "A)" and "A:" are all accepted. */
const IMPORT_OPTION_RE = /^([A-J])\s*[.):]\s+(.+)$/;
/** "Correct Answer: B" — also accepts a bare "Answer:" line. */
const IMPORT_ANSWER_RE = /^(?:Correct\s+Answer|Answer)\s*:\s*(.+)$/i;
const IMPORT_EXPLANATION_RE = /^Explanation\s*:\s*(.+)$/i;
/** "B. Paris" — a letter followed by its option text, not a text answer. */
const IMPORT_LETTER_TEXT_RE = /^([A-Z])\s*[.)]\s+.+$/i;
const IMPORT_LETTERS_AND_RE = /^[A-Z](\s*(,|and)\s*[A-Z])+$/i;

interface ImportBlock {
  number: number;
  typeTag?: string;
  points: number;
  promptLines: string[];
  options: ParsedOption[];
  /** Raw "Correct Answer:" value, if the question had one. */
  keyRaw?: string;
  explanationLines: string[];
}

/**
 * Read one question's "Correct Answer:" value. Accepts a single letter
 * ("B"), several ("A, C" / "A and C"), a letter with its text
 * ("B. Paris"), or free text (a fill-in-the-blank answer such as "H2O").
 */
function parseImportKeyValue(raw: string): { letters: string[] } | { text: string } {
  const value = raw.trim();
  const letterText = IMPORT_LETTER_TEXT_RE.exec(value);
  if (letterText) return { letters: [letterText[1].toUpperCase()] };
  if (LETTERS_ONLY_RE.test(value) || IMPORT_LETTERS_AND_RE.test(value)) {
    // Keep every letter (even one past the options, like Z) so the
    // unknown-option check below can flag it — never drop it silently.
    return { letters: value.toUpperCase().split(/[\s,]+|and/i).filter((l) => /^[A-Z]$/.test(l)) };
  }
  return { text: value };
}

/**
 * Validate one imported question and apply its correct answer, using
 * the same warnings as the PDF parser (flag, never guess). Unlike the
 * PDF parser, an inferred type is NOT flagged here: inferring the type
 * from "Correct Answer:" is how the text format works, so flagging
 * every question would be noise. A question with no usable key is
 * still flagged — it cannot be published until the teacher fixes it.
 */
function finalizeImportQuestion(block: ImportBlock, warnings: ParseWarning[]): ParsedQuestion {
  const prompt = block.promptLines.join(' ').replace(/\s+/g, ' ').trim();
  const explanation = block.explanationLines.join(' ').replace(/\s+/g, ' ').trim() || undefined;
  const key = block.keyRaw !== undefined ? parseImportKeyValue(block.keyRaw) : undefined;
  const options = block.options;

  let type = normalizeTypeTag(block.typeTag);
  if (block.typeTag && !type) {
    warnings.push({
      questionNumber: block.number,
      message: `Unknown question-type tag "[${block.typeTag}]" on Q${block.number} — the type was inferred from the correct answer instead.`,
      severity: 'warning',
    });
  }
  if (!type) type = inferType(prompt, key).type;

  const question: ParsedQuestion = {
    number: block.number,
    type,
    prompt,
    points: block.points,
    options,
    acceptedAnswers: [],
    ...(explanation ? { explanation } : {}),
    needsReview: false,
  };

  // Apply the correct answer.
  if (!key) {
    question.needsReview = true;
    question.reviewNote = 'No "Correct Answer:" line — set the correct answer when editing the question.';
    warnings.push({
      questionNumber: block.number,
      message: `Q${block.number} has no "Correct Answer:" line — the correct answer must be set when editing the question.`,
      severity: 'warning',
    });
  } else if (type === 'fill_blank') {
    if ('text' in key) {
      question.correctText = key.text;
    } else {
      question.correctText = key.letters.join(', ');
      question.needsReview = true;
      question.reviewNote = 'The correct answer looks like option letters, but this is a fill-in-the-blank — check the answer.';
      warnings.push({
        questionNumber: block.number,
        message: `Q${block.number} is a fill-in-the-blank but its correct answer looks like option letters — check the answer.`,
        severity: 'warning',
      });
    }
  } else {
    if (!('letters' in key)) {
      question.needsReview = true;
      question.reviewNote = 'The correct answer is text, but this question has options — check the correct option.';
      warnings.push({
        questionNumber: block.number,
        message: `Q${block.number} has options but its correct answer is text, not option letters — check it.`,
        severity: 'warning',
      });
    } else {
      const unknown = key.letters.filter((l) => !options.some((o) => o.letter === l));
      if (unknown.length > 0) {
        question.needsReview = true;
        question.reviewNote = `The correct answer names option(s) ${unknown.join(', ')} which do not exist.`;
        warnings.push({
          questionNumber: block.number,
          message: `Q${block.number}'s correct answer names option(s) ${unknown.join(', ')} which do not exist among its options.`,
          severity: 'warning',
        });
      }
      for (const option of options) {
        option.isCorrect = key.letters.includes(option.letter);
      }
    }
  }

  // Structural validation (flag, never guess) — same rules as the PDF parser.
  if (!prompt) {
    question.needsReview = true;
    question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'No question text was found.';
    warnings.push({ questionNumber: block.number, message: `Q${block.number} has no question text.`, severity: 'warning' });
  }
  if (type !== 'fill_blank' && options.length < 2) {
    question.needsReview = true;
    question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'Fewer than 2 answer options.';
    warnings.push({
      questionNumber: block.number,
      message: `Q${block.number} has ${options.length} answer option(s) — at least 2 are needed.`,
      severity: 'warning',
    });
  }
  if (type !== 'fill_blank' && options.length > 0 && !options.some((o) => o.isCorrect)) {
    question.needsReview = true;
    question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'No correct option is marked.';
    warnings.push({
      questionNumber: block.number,
      message: `Q${block.number} has no correct option marked.`,
      severity: 'warning',
    });
  }
  if (type === 'mcq' && options.filter((o) => o.isCorrect).length > 1) {
    question.needsReview = true;
    question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'More than one correct option for an MCQ.';
    warnings.push({
      questionNumber: block.number,
      message: `Q${block.number} is an MCQ but the correct answer marks more than one option correct.`,
      severity: 'warning',
    });
  }
  if (type === 'choose_two' && options.filter((o) => o.isCorrect).length !== 2) {
    question.needsReview = true;
    question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'Choose Two needs exactly two correct options.';
    warnings.push({
      questionNumber: block.number,
      message: `Q${block.number} is Choose Two but the correct answer marks ${options.filter((o) => o.isCorrect).length} option(s) correct (exactly 2 required).`,
      severity: 'warning',
    });
  }
  if (type === 'choose_three' && options.filter((o) => o.isCorrect).length !== 3) {
    question.needsReview = true;
    question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'Choose Three needs exactly three correct options.';
    warnings.push({
      questionNumber: block.number,
      message: `Q${block.number} is Choose Three but the correct answer marks ${options.filter((o) => o.isCorrect).length} option(s) correct (exactly 3 required).`,
      severity: 'warning',
    });
  }
  if (type === 'fill_blank') {
    if (!/_{3,}|\[blank\]/i.test(prompt)) {
      question.needsReview = true;
      question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'The prompt has no blank (___) marker.';
      warnings.push({
        questionNumber: block.number,
        message: `Q${block.number} is a fill-in-the-blank but its prompt has no blank (___) marker.`,
        severity: 'warning',
      });
    }
    if (!question.correctText) {
      question.needsReview = true;
      question.reviewNote = (question.reviewNote ? question.reviewNote + ' ' : '') + 'No correct answer text.';
      warnings.push({
        questionNumber: block.number,
        message: `Q${block.number} has no correct answer text.`,
        severity: 'warning',
      });
    }
  }

  return question;
}

/**
 * Parse pasted quiz text in the "Question N: … / A. … / Correct Answer:
 * … / Explanation: …" format. Returns the questions plus a warning for
 * every incomplete or misformatted question — the teacher sees the
 * warnings in the UI and fixes the flagged questions before publishing.
 * An empty paste, or text with no "Question N:" header at all, is an
 * error with zero questions (never a silent empty import).
 */
export function parseQuizTextImport(rawText: string): ParseResult {
  const warnings: ParseWarning[] = [];
  const text = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (text.length > MAX_QUIZ_TEXT_IMPORT_CHARS) {
    return {
      questions: [],
      warnings: [
        {
          message: `The pasted text is too long (${text.length.toLocaleString('en-US')} characters; the limit is ${MAX_QUIZ_TEXT_IMPORT_CHARS.toLocaleString('en-US')}). Split it into smaller quizzes.`,
          severity: 'error',
        },
      ],
      isScanned: false,
      answerKeyEntries: 0,
    };
  }

  const lines = text.split('\n').map((l) => l.trim());
  const blocks: ImportBlock[] = [];
  let current: ImportBlock | null = null;
  let inExplanation = false;
  for (const line of lines) {
    if (!line) continue;
    const header = IMPORT_HEADER_RE.exec(line);
    if (header) {
      if (current) blocks.push(current);
      current = {
        number: Number(header[1]),
        typeTag: header[2]?.trim() || undefined,
        points: header[3] ? Number(header[3]) : 1,
        promptLines: header[4] ? [header[4].trim()] : [],
        options: [],
        explanationLines: [],
      };
      inExplanation = false;
      continue;
    }
    if (!current) {
      // Text before the first "Question N:" header is layout, not a
      // question — ignore it (AI output often starts with a title line).
      continue;
    }
    const answer = IMPORT_ANSWER_RE.exec(line);
    if (answer) {
      if (current.keyRaw !== undefined) {
        warnings.push({
          questionNumber: current.number,
          message: `Q${current.number} has two "Correct Answer:" lines — the first one was kept.`,
          severity: 'warning',
        });
      } else {
        current.keyRaw = answer[1].trim();
      }
      inExplanation = false;
      continue;
    }
    const explanation = IMPORT_EXPLANATION_RE.exec(line);
    if (explanation) {
      current.explanationLines.push(explanation[1].trim());
      inExplanation = true;
      continue;
    }
    if (inExplanation) {
      current.explanationLines.push(line);
      continue;
    }
    const opt = IMPORT_OPTION_RE.exec(line);
    if (opt) {
      const letter = opt[1].toUpperCase();
      if (current.options.some((o) => o.letter === letter)) {
        warnings.push({
          questionNumber: current.number,
          message: `Option ${letter} appears twice in Q${current.number} — the second copy was ignored.`,
          severity: 'warning',
        });
        continue;
      }
      current.options.push({ letter, text: opt[2].trim(), isCorrect: false });
      continue;
    }
    // Anything else is a continuation: of the last option (wrapped
    // option text) once options have started, otherwise of the prompt.
    if (current.options.length > 0) {
      const last = current.options[current.options.length - 1];
      last.text = `${last.text} ${line}`.trim();
    } else {
      current.promptLines.push(line);
    }
  }
  if (current) blocks.push(current);

  if (blocks.length === 0) {
    warnings.push({
      message:
        'No questions were found in the pasted text. Each question must start with a line like "Question 1: …" — see the sample format on this page for the exact layout.',
      severity: 'error',
    });
    return { questions: [], warnings, isScanned: false, answerKeyEntries: 0 };
  }

  const seen = new Set<number>();
  const questions: ParsedQuestion[] = [];
  let answerKeyEntries = 0;
  for (const block of blocks) {
    if (seen.has(block.number)) {
      warnings.push({
        questionNumber: block.number,
        message: `Duplicate question number Q${block.number} — the second copy was ignored, the first was kept.`,
        severity: 'error',
      });
      const kept = questions.find((q) => q.number === block.number);
      if (kept) {
        kept.needsReview = true;
        kept.reviewNote = 'Duplicate question number — kept the first copy; check this question.';
      }
      continue;
    }
    seen.add(block.number);
    if (block.keyRaw !== undefined) answerKeyEntries++;
    questions.push(finalizeImportQuestion(block, warnings));
  }

  questions.sort((a, b) => a.number - b.number);
  return { questions, warnings, isScanned: false, answerKeyEntries };
}
