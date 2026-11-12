/**
 * Text-import format (Phase 4, Module 8) — the sample quiz text and the
 * ready-made AI prompt shown on the instructor quiz page.
 *
 * The sample below is the format contract: it must parse with zero
 * warnings (covered by tests/quiz-parser.test.ts). Keep the wording
 * plain and the structure simple — the teacher copies the prompt,
 * fills in the [BRACKETS], gives it to any AI tool, and pastes the
 * result back into the site.
 */

export const QUIZ_TEXT_IMPORT_SAMPLE = `Question 1: What is the capital of France?
A. London
B. Paris
C. Berlin
D. Madrid
Correct Answer: B
Explanation: Paris is the capital of France.

Question 2: The chemical symbol for water is ______.
Correct Answer: H2O
Explanation: H stands for hydrogen and O stands for oxygen.

Question 3: Choose exactly two primary colours.
A. Red
B. Green
C. Blue
D. Yellow
Correct Answer: A, C
Explanation: Red and blue are primary colours. Green and yellow are not.`;

/** Short plain-English lines that explain the format on the quiz page. */
export const QUIZ_TEXT_FORMAT_RULES: string[] = [
  'Start each question with a line like: Question 1: Write the question here.',
  'Write the options below the question, one per line, labelled A, B, C, D.',
  'Write the correct answer on its own line, like: Correct Answer: B',
  'For a fill in the blank question, write ______ in the question and put the answer text on the "Correct Answer:" line, with no options.',
  'Write one short explanation on its own line, like: Explanation: Write one sentence that explains the answer.',
  'Leave one blank line between questions.',
];

export const QUIZ_AI_PROMPT = `Create a quiz about [TOPIC].

Total questions: [TOTAL QUESTIONS]
Difficulty: [DIFFICULTY - Easy, Medium or Hard]
Additional instructions: [ADDITIONAL INSTRUCTIONS]

Write the quiz in this exact format:

Question 1: Write the question here.
A. First option
B. Second option
C. Third option
D. Fourth option
Correct Answer: B
Explanation: Write one short sentence that explains why the answer is correct.

Rules:
- Number the questions from 1 in order.
- Write each question in the format above.
- For questions with options, write 4 options labelled A, B, C, D.
- Write the correct answer on the "Correct Answer:" line, using only the option letter.
- For fill in the blank questions, write ______ in the question and write the answer text on the "Correct Answer:" line, with no options.
- Write one short explanation for every question.
- Do not add any other text, headings or numbering outside this format.`;
