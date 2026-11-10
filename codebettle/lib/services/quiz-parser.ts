/**
 * Quiz PDF parsing (Phase 5) — pure functions, no database.
 *
 * The expected format is the one the sample template demonstrates
 * (lib/services/quiz-sample-pdf.ts) — teachers give the template to any
 * external AI model and upload the PDF that model produces:
 *
 *   Q1 [MCQ] (2 points)
 *   What is the capital of France?
 *   A. London
 *   B. Paris
 *   ...
 *
 *   Answer Key:
 *   Q1: B
 *   Q2: H2O
 *   Q3: A, B, D
 *
 * Rules the parser follows (master prompt §6D):
 * - Text is extracted with pdfjs-dist (text-based PDFs). A PDF with no
 *   extractable text is flagged as scanned — OCR is NOT available on
 *   this machine, so the teacher adds questions manually in review.
 * - Question types come from the [Type] tag when present. When the tag
 *   is missing, the type is inferred from the answer-key entry and the
 *   prompt wording — and the question is ALWAYS flagged needsReview
 *   with a note, so the inference is confirmed by the teacher.
 * - The answer key is applied by question number. Missing keys,
 *   duplicate numbering, malformed options, wrong selection counts for
 *   Choose Two / Choose Three, and incomplete questions are all flagged
 *   as warnings — never silently guessed, never silently dropped.
 * - Sanitisation: control characters are stripped; text is capped.
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ParseWarning, QuizQuestionType } from '../db/types';

export const MAX_QUIZ_PDF_PAGES = 50;
export const MAX_QUIZ_TEXT_CHARS = 500_000;
export const MAX_QUIZ_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

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
  needsReview: boolean;
  reviewNote?: string;
}

export interface ParseResult {
  questions: ParsedQuestion[];
  warnings: ParseWarning[];
  /** True when the PDF had (almost) no extractable text — likely scanned. */
  isScanned: boolean;
  answerKeyEntries: number;
}

/** Extract the text of a PDF as lines (top-to-bottom, left-to-right). */
export async function extractPdfText(
  input: Buffer | ArrayBuffer,
): Promise<{ text: string; pageCount: number }> {
  const data = input instanceof Buffer ? new Uint8Array(input) : new Uint8Array(input);
  const doc = await pdfjs
    .getDocument({ data, verbosity: 0 })
    .promise;
  const pageCount = doc.numPages;
  const lines: string[] = [];
  const pages = Math.min(pageCount, MAX_QUIZ_PDF_PAGES);
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Group items into lines by y coordinate (PDF y grows upwards).
    const byY = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const str = (item.str as string).trim();
      if (!str) continue;
      const y = Math.round((item.transform[5] as number) / 2) * 2;
      const x = item.transform[4] as number;
      const bucket = byY.get(y) ?? [];
      bucket.push({ x, str });
      byY.set(y, bucket);
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      const parts = byY.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.str);
      lines.push(parts.join(' '));
    }
    lines.push('');
  }
  let text = lines.join('\n');
  // Strip control characters (keep newlines/tabs) and cap the size.
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (text.length > MAX_QUIZ_TEXT_CHARS) {
    text = text.slice(0, MAX_QUIZ_TEXT_CHARS);
  }
  return { text, pageCount };
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
            'No readable text could be extracted from this PDF — it looks like a scanned or image-based file. OCR is not available here; add the questions manually in the review editor instead.',
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
        'No questions were found in this PDF. Questions must start with a line like "Q1 [MCQ] (2 points)" — see the sample template for the expected format.',
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

/** Extract a PDF and parse it in one step. */
export async function parseQuizPdf(input: Buffer | ArrayBuffer): Promise<ParseResult & { text: string; pageCount: number }> {
  const { text, pageCount } = await extractPdfText(input);
  const result = parseQuizText(text);
  return { ...result, text, pageCount };
}
