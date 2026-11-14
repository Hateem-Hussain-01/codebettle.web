/**
 * Assignments & Grading helpers — pure functions, unit-testable.
 *
 * A submission is a Google Colab LINK, never a file: there is no file
 * upload, no Storage bucket and no file handling anywhere in this
 * feature. A submission is just a URL string in the database, so it
 * costs (nearly) no storage no matter how many assignments or
 * submissions there are.
 */

import type { SubmissionStatus } from './db/types';

/** The only host a submission link may point to. */
export const COLAB_HOST = 'colab.research.google.com';

/**
 * True when `value` is a valid HTTPS URL on colab.research.google.com
 * (e.g. https://colab.research.google.com/drive/<notebook-id>). Any
 * other host, any http:// URL, or anything that is not a URL is
 * rejected — generic file hosts and other sites are never accepted.
 */
export function isValidColabUrl(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.hostname.toLowerCase() !== COLAB_HOST) return false;
  return true;
}

/** Human-readable error for a bad Colab link, or null when it is fine. */
export function validateColabUrl(value: string): string | null {
  if (!value || value.trim().length === 0) return 'Please paste a Google Colab link.';
  if (!isValidColabUrl(value)) return 'Please paste a Google Colab link (colab.research.google.com).';
  return null;
}

export interface AssignmentInput {
  title: string;
  description: string;
  courseId: string;
  batchId?: string | null;
  dueDate?: string | null;
  maxMarks: number;
}

/** Validate an assignment create/edit payload. Returns an error or null. */
export function validateAssignment(input: AssignmentInput): string | null {
  if (!input.title || input.title.trim().length === 0) return 'Title is required.';
  if (input.title.trim().length > 200) return 'Title must be 200 characters or fewer.';
  if (!input.description || input.description.trim().length === 0) return 'Description is required.';
  if (!input.courseId || input.courseId.trim().length === 0) return 'Course is required.';
  if (!Number.isInteger(input.maxMarks) || input.maxMarks <= 0) {
    return 'Max marks must be a whole number greater than 0.';
  }
  if (input.maxMarks > 1000) return 'Max marks must be 1000 or fewer.';
  if (input.dueDate) {
    const d = new Date(input.dueDate);
    if (Number.isNaN(d.getTime())) return 'Due date is not a valid date.';
  }
  return null;
}

/** Validate a submission payload (Colab link only). Returns an error or null. */
export function validateSubmission(colabUrl: string): string | null {
  return validateColabUrl(colabUrl);
}

/**
 * Validate a grade. Marks must be a whole number from 0 up to the
 * assignment's max marks. Feedback is optional free text.
 */
export function validateGrade(marks: number, maxMarks: number): string | null {
  if (!Number.isInteger(marks)) return 'Marks must be a whole number.';
  if (marks < 0) return 'Marks cannot be negative.';
  if (marks > maxMarks) return `Marks cannot be more than the max marks (${maxMarks}).`;
  return null;
}

/**
 * True when a submission made at `submittedAt` is past the due date.
 * Accepts ISO strings or Dates — callers mix both (mapped types carry
 * ISO strings, the DB carries Dates).
 */
export function isLateSubmission(
  submittedAt: string | Date,
  dueDate: string | Date | null,
): boolean {
  if (!dueDate) return false;
  return new Date(submittedAt).getTime() > new Date(dueDate).getTime();
}

/**
 * Status for a fresh submission: 'late' when it is past the due date,
 * otherwise 'submitted'. Grading moves it to 'graded' (see
 * gradeSubmission in lib/db/assignments.ts). The late flag is also
 * exposed as a computed `isLate` on the mapped type, so the UI can
 * still show it after grading.
 */
export function computeSubmissionStatus(
  submittedAt: string | Date,
  dueDate: string | Date | null,
): SubmissionStatus {
  return isLateSubmission(submittedAt, dueDate) ? 'late' : 'submitted';
}
