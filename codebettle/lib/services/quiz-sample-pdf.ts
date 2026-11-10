/**
 * Sample quiz PDF template (Phase 5, master prompt §6A).
 *
 * Generates the downloadable template teachers give to any external AI
 * model as a formatting reference. The questions and the answer key are
 * rendered from ONE data structure (SAMPLE_QUIZ_QUESTIONS), so the key
 * can never drift from the questions.
 *
 * The layout is deliberately plain ASCII text in the exact format the
 * parser understands (lib/services/quiz-parser.ts) — the round-trip is
 * covered by tests/quiz-parser.test.ts (generate -> extract -> parse
 * must recover all 11 questions with the right types and answers).
 *
 * Question counts per type: MCQ 3, fill-in-the-blank 2, checkbox 2,
 * Choose Two 2, Choose Three 2 = 11 questions.
 */
import { jsPDF } from 'jspdf';

export interface SampleQuizQuestion {
  number: number;
  typeLabel: string;
  points: number;
  prompt: string;
  options?: string[];
  answerKey: string;
}

export const SAMPLE_QUIZ_QUESTIONS: SampleQuizQuestion[] = [
  {
    number: 1,
    typeLabel: 'MCQ',
    points: 2,
    prompt: 'Which of the following is a JavaScript library for building user interfaces?',
    options: ['Django', 'React', 'Laravel', 'Flask'],
    answerKey: 'B',
  },
  {
    number: 2,
    typeLabel: 'MCQ',
    points: 1,
    prompt: 'What does HTML stand for?',
    options: [
      'Hyper Text Markup Language',
      'High Tech Modern Language',
      'Hyperlinks and Text Markup Language',
      'Home Tool Markup Language',
    ],
    answerKey: 'A',
  },
  {
    number: 3,
    typeLabel: 'MCQ',
    points: 2,
    prompt: 'Which HTTP method is used to retrieve data from a server?',
    options: ['POST', 'DELETE', 'GET', 'PUT'],
    answerKey: 'C',
  },
  {
    number: 4,
    typeLabel: 'Fill in the blank',
    points: 1,
    prompt: 'The chemical symbol for water is ______.',
    answerKey: 'H2O',
  },
  {
    number: 5,
    typeLabel: 'Fill in the blank',
    points: 2,
    prompt: 'In Python, the keyword used to define a function is ______.',
    answerKey: 'def',
  },
  {
    number: 6,
    typeLabel: 'Checkbox',
    points: 2,
    prompt: 'Select all prime numbers:',
    options: ['2', '3', '4', '5'],
    answerKey: 'A, B, D',
  },
  {
    number: 7,
    typeLabel: 'Checkbox',
    points: 2,
    prompt: 'Which of the following are programming languages?',
    options: ['Python', 'HTML', 'JavaScript', 'CSS'],
    answerKey: 'A, C',
  },
  {
    number: 8,
    typeLabel: 'Choose Two',
    points: 2,
    prompt: 'Select exactly two colours in the flag of France:',
    options: ['Red', 'Green', 'Blue', 'Yellow'],
    answerKey: 'A, C',
  },
  {
    number: 9,
    typeLabel: 'Choose Two',
    points: 3,
    prompt: 'Select exactly two valid Python data types:',
    options: ['list', 'integer', 'array', 'dictionary'],
    answerKey: 'A, D',
  },
  {
    number: 10,
    typeLabel: 'Choose Three',
    points: 3,
    prompt: 'Select exactly three primary colours:',
    options: ['Red', 'Blue', 'Green', 'Black'],
    answerKey: 'A, B, C',
  },
  {
    number: 11,
    typeLabel: 'Choose Three',
    points: 3,
    prompt: 'Select exactly three pillars of object-oriented programming:',
    options: ['Encapsulation', 'Inheritance', 'Compilation', 'Polymorphism'],
    answerKey: 'A, B, D',
  },
];

const TYPE_SECTIONS: Array<{ heading: string; note: string; typeLabel: string }> = [
  {
    heading: 'Section 1 - Multiple Choice (MCQ)',
    note: 'One correct answer per question. Four options labelled A, B, C, D.',
    typeLabel: 'MCQ',
  },
  {
    heading: 'Section 2 - Fill in the Blank',
    note: 'The blank is written as ______ in the question. The answer key gives the exact word or value.',
    typeLabel: 'Fill in the blank',
  },
  {
    heading: 'Section 3 - Checkbox (Multiple Select)',
    note: 'One or more options can be correct. The answer key lists every correct option, separated by commas.',
    typeLabel: 'Checkbox',
  },
  {
    heading: 'Section 4 - Choose Two',
    note: 'The student must select exactly two options. The answer key lists exactly two letters.',
    typeLabel: 'Choose Two',
  },
  {
    heading: 'Section 5 - Choose Three',
    note: 'The student must select exactly three options. The answer key lists exactly three letters.',
    typeLabel: 'Choose Three',
  },
];

const PAGE_WIDTH_MM = 210;
const MARGIN_MM = 18;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;

/** Generate the sample template PDF. Returns the raw PDF bytes. */
export function generateSampleQuizPdf(): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 20;

  const ensureSpace = (needed: number) => {
    if (y + needed > 275) {
      doc.addPage();
      y = 20;
    }
  };
  const writeLines = (lines: string[], fontSize: number, bold = false, gap = 5) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    for (const line of lines) {
      ensureSpace(gap + 2);
      doc.text(line, MARGIN_MM, y);
      y += gap;
    }
  };
  const writeWrapped = (text: string, fontSize: number, bold = false, gap = 5) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH_MM);
    for (const line of lines) {
      ensureSpace(gap + 2);
      doc.text(line, MARGIN_MM, y);
      y += gap;
    }
  };

  // Title + how to use it.
  writeLines(['CodeBettle Quiz Template - Sample'], 17, true, 8);
  writeWrapped(
    'Use this template as the formatting reference for any AI model that generates a quiz. Give the model this file (or copy its structure) together with your topics, and ask it to produce a quiz in exactly the same structure. Then upload the generated PDF on the quiz creation page.',
    11,
    false,
    5,
  );
  y += 3;
  writeLines(['How to use this template', '1. Download this file and share it with your chosen AI model.', '2. Tell the model your topics, difficulty, and how many questions you need.', '3. Ask for the same format: numbered questions with a type tag, options A-D, and a separate Answer Key at the end.', '4. Upload the generated PDF. The platform reads the questions and the answer key, and you review everything before publishing.'], 11, false, 5);
  y += 2;
  writeLines(['Format rules', '- Every question starts with a line like: Q1 [MCQ] (2 points)', '- Options are labelled A. B. C. D. on their own lines.', '- Fill in the blank uses ______ in the question text.', '- The Answer Key is a separate section at the end: one line per question, e.g. Q1: B or Q6: A, B, D.', '- Choose Two questions need exactly two correct options; Choose Three need exactly three.'], 11, false, 5);
  y += 4;

  // Question sections.
  for (const section of TYPE_SECTIONS) {
    ensureSpace(14);
    writeLines([section.heading], 13, true, 7);
    writeWrapped(section.note, 10, false, 5);
    y += 2;
    for (const q of SAMPLE_QUIZ_QUESTIONS.filter((item) => item.typeLabel === section.typeLabel)) {
      const header = `Q${q.number} [${q.typeLabel}] (${q.points} point${q.points === 1 ? '' : 's'})`;
      writeLines([header], 11, true, 6);
      writeWrapped(q.prompt, 11, false, 5);
      if (q.options) {
        const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        for (let i = 0; i < q.options.length; i++) {
          writeLines([`${letters[i]}. ${q.options[i]}`], 11, false, 5);
        }
      }
      y += 3;
    }
    y += 2;
  }

  // Answer key (clearly separated, at the end). The section contains
  // ONLY key lines — the format is already explained in the intro's
  // "Format rules", so nothing else goes here.
  ensureSpace(20);
  writeLines(['Answer Key'], 13, true, 7);
  for (const q of SAMPLE_QUIZ_QUESTIONS) {
    writeLines([`Q${q.number}: ${q.answerKey}`], 11, false, 5);
  }

  const out = doc.output('arraybuffer');
  return Buffer.from(out);
}
