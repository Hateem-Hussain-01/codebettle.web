/**
 * Assignment + Submission repository (Assignments & Grading).
 * Same fail-safe shape as lib/db/links.ts: the tables arrive via
 * migration 20261114T1422_add_assignments, which Eman runs himself in
 * the Supabase SQL Editor. Until it runs, reads return empty (the
 * portals show their honest empty state, admin shows a "run the SQL"
 * state) and writes return a clear error.
 *
 * Submissions are Google Colab LINKS only — never files. There is no
 * file upload, no Storage bucket and no file handling anywhere here; a
 * submission is just a URL string in the database.
 */
import { getDb } from './client';
import { mapAssignmentRow, mapSubmissionRow, stripUndefined } from './mappers';
import type {
  Assignment,
  AssignmentRow,
  AssignmentSubmission,
  AssignmentSubmissionRow,
  SubmissionStatus,
} from './types';
import { formatBatchLabel } from './types';
import { getUsersByIds } from './users';

export function isMissingAssignmentTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  if (code === '42P01' && (text.includes('Assignment') || text.includes('AssignmentSubmission'))) return true;
  return (
    /relation .* does not exist/i.test(text) &&
    (text.includes('Assignment') || text.includes('AssignmentSubmission'))
  );
}

async function withAssignmentTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingAssignmentTableError(error)) return fallback;
    throw error;
  }
}

export const ASSIGNMENT_TABLES_MISSING_MESSAGE =
  'Assignments tables are not set up yet — run codebettle-assignments-migration.sql in the Supabase SQL Editor first.';

function throwIfTablesMissing(error: unknown): never {
  if (isMissingAssignmentTableError(error)) {
    throw new Error(ASSIGNMENT_TABLES_MISSING_MESSAGE);
  }
  throw error;
}

/** Cheap probe: true when the tables exist (migration has run). */
export async function areAssignmentTablesReady(): Promise<boolean> {
  try {
    await getDb().orm.public.Assignment.orderBy((a) => a.createdAt.desc()).limit(1).all();
    return true;
  } catch (error) {
    if (isMissingAssignmentTableError(error)) return false;
    throw error;
  }
}

export interface CreateAssignmentInput {
  courseId: string;
  batchId?: string | null;
  title: string;
  description: string;
  /** ISO string or Date — coerced to a Date before the write. */
  dueDate?: string | Date | null;
  maxMarks: number;
  createdBy: string;
}

export async function createAssignment(input: CreateAssignmentInput): Promise<Assignment> {
  try {
    const row = await getDb().orm.public.Assignment.create({
      courseId: input.courseId,
      batchId: input.batchId ?? null,
      title: input.title,
      description: input.description,
      // Coerce the ISO string to a Date (repo convention, cf. quizzes):
      // the fake DB stores what it is given, and the mapper calls
      // toISOString() on it — a string would crash.
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      maxMarks: input.maxMarks,
      createdBy: input.createdBy,
    });
    return mapAssignmentRow(row as AssignmentRow);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

export async function getAssignmentById(id: string): Promise<Assignment | null> {
  return withAssignmentTableFallback(async () => {
    const row = await getDb().orm.public.Assignment.where({ id }).first();
    return row ? mapAssignmentRow(row as AssignmentRow) : null;
  }, null);
}

/** Every assignment, newest first (admin view). */
export async function listAllAssignments(): Promise<Assignment[]> {
  return withAssignmentTableFallback(async () => {
    const rows = await getDb()
      .orm.public.Assignment.orderBy((a) => a.createdAt.desc())
      .all();
    return rows.map((r) => mapAssignmentRow(r as AssignmentRow));
  }, []);
}

/** Assignments for a set of courses, newest first. Empty input -> []. */
export async function listAssignmentsByCourseIds(courseIds: string[]): Promise<Assignment[]> {
  const unique = [...new Set(courseIds)];
  if (unique.length === 0) return [];
  return withAssignmentTableFallback(async () => {
    const rows = await getDb()
      .orm.public.Assignment.where((a) => a.courseId.in(unique))
      .orderBy((a) => a.createdAt.desc())
      .all();
    return rows.map((r) => mapAssignmentRow(r as AssignmentRow));
  }, []);
}

export interface UpdateAssignmentInput {
  title?: string;
  description?: string;
  batchId?: string | null;
  /** ISO string or Date — coerced to a Date before the write. */
  dueDate?: string | Date | null;
  maxMarks?: number;
}

export async function updateAssignment(
  id: string,
  input: UpdateAssignmentInput,
): Promise<Assignment | null> {
  try {
    const patch = stripUndefined({
      ...input,
      // Coerce the ISO string to a Date (same reason as createAssignment).
      dueDate:
        input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
    });
    const updated = await getDb()
      .orm.public.Assignment.where({ id })
      .update(patch);
    if (!updated) return null;
    return getAssignmentById(id);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

/**
 * Delete an assignment AND its submissions. The FK from
 * AssignmentSubmission to Assignment has no ON DELETE CASCADE, so the
 * submissions must go first or the delete fails.
 */
export async function deleteAssignment(id: string): Promise<boolean> {
  try {
    await getDb().orm.public.AssignmentSubmission.where({ assignmentId: id }).delete();
    const deleted = await getDb().orm.public.Assignment.where({ id }).delete();
    return deleted !== null;
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

export interface CreateSubmissionInput {
  assignmentId: string;
  studentId: string;
  colabUrl: string;
  status: SubmissionStatus;
}

export async function createSubmission(input: CreateSubmissionInput): Promise<AssignmentSubmission> {
  try {
    const row = await getDb().orm.public.AssignmentSubmission.create({
      assignmentId: input.assignmentId,
      studentId: input.studentId,
      colabUrl: input.colabUrl,
      status: input.status,
    });
    const assignment = await getAssignmentById(input.assignmentId);
    return mapSubmissionRow(row as AssignmentSubmissionRow, assignment?.dueDate ? new Date(assignment.dueDate) : null);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

export async function getSubmissionById(id: string): Promise<AssignmentSubmission | null> {
  return withAssignmentTableFallback(async () => {
    const row = await getDb().orm.public.AssignmentSubmission.where({ id }).first();
    if (!row) return null;
    const assignment = await getAssignmentById(row.assignmentId);
    return mapSubmissionRow(
      row as AssignmentSubmissionRow,
      assignment?.dueDate ? new Date(assignment.dueDate) : null,
    );
  }, null);
}

export async function getSubmissionByAssignmentAndStudent(
  assignmentId: string,
  studentId: string,
): Promise<AssignmentSubmission | null> {
  return withAssignmentTableFallback(async () => {
    const row = await getDb()
      .orm.public.AssignmentSubmission.where({ assignmentId, studentId })
      .first();
    if (!row) return null;
    const assignment = await getAssignmentById(assignmentId);
    return mapSubmissionRow(
      row as AssignmentSubmissionRow,
      assignment?.dueDate ? new Date(assignment.dueDate) : null,
    );
  }, null);
}

/** All submissions for one assignment, oldest first. */
export async function listSubmissionsByAssignment(assignmentId: string): Promise<AssignmentSubmission[]> {
  return withAssignmentTableFallback(async () => {
    const rows = await getDb()
      .orm.public.AssignmentSubmission.where({ assignmentId })
      .orderBy((s) => s.submittedAt.asc())
      .all();
    const assignment = await getAssignmentById(assignmentId);
    const dueDate = assignment?.dueDate ? new Date(assignment.dueDate) : null;
    return rows.map((r) => mapSubmissionRow(r as AssignmentSubmissionRow, dueDate));
  }, []);
}

/** All submissions by one student, newest first. */
export async function listSubmissionsByStudent(studentId: string): Promise<AssignmentSubmission[]> {
  return withAssignmentTableFallback(async () => {
    const rows = await getDb()
      .orm.public.AssignmentSubmission.where({ studentId })
      .orderBy((s) => s.submittedAt.desc())
      .all();
    const assignmentIds = [...new Set(rows.map((r) => r.assignmentId))];
    const assignments = await listAssignmentsByIds(assignmentIds);
    const dueByAssignment = new Map(assignments.map((a) => [a.id, a.dueDate ? new Date(a.dueDate) : null]));
    return rows.map((r) =>
      mapSubmissionRow(r as AssignmentSubmissionRow, dueByAssignment.get(r.assignmentId) ?? null),
    );
  }, []);
}

async function listAssignmentsByIds(ids: string[]): Promise<Assignment[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  return withAssignmentTableFallback(async () => {
    const rows = await getDb()
      .orm.public.Assignment.where((a) => a.id.in(unique))
      .all();
    return rows.map((r) => mapAssignmentRow(r as AssignmentRow));
  }, []);
}

export interface UpdateSubmissionInput {
  colabUrl?: string;
  status?: SubmissionStatus;
  submittedAt?: Date;
}

/** Resubmit: update the Colab link (and submitted time/status). Only until graded. */
export async function updateSubmission(
  id: string,
  input: UpdateSubmissionInput,
): Promise<AssignmentSubmission | null> {
  try {
    const updated = await getDb()
      .orm.public.AssignmentSubmission.where({ id })
      .update(stripUndefined({ ...input }));
    if (!updated) return null;
    return getSubmissionById(id);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

export interface GradeSubmissionInput {
  marks: number;
  feedback?: string | null;
  gradedBy: string;
}

/** Grade a submission: marks + feedback, status -> 'graded'. */
export async function gradeSubmission(
  id: string,
  input: GradeSubmissionInput,
): Promise<AssignmentSubmission | null> {
  try {
    const updated = await getDb()
      .orm.public.AssignmentSubmission.where({ id })
      .update({
        marks: input.marks,
        feedback: input.feedback ?? null,
        status: 'graded',
        gradedAt: new Date(),
        gradedBy: input.gradedBy,
      });
    if (!updated) return null;
    return getSubmissionById(id);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

// --- Enriched loaders (joins for the portal pages) ---

/**
 * Enrich a list of assignments with the course title, batch label,
 * creator name, and submission/graded counts. Used by the instructor
 * and admin lists.
 */
export async function enrichAssignments(assignments: Assignment[]): Promise<Assignment[]> {
  if (assignments.length === 0) return assignments;
  const [courses, batches, creators, submissions] = await Promise.all([
    getDb()
      .orm.public.Course.where((c) => c.id.in([...new Set(assignments.map((a) => a.courseId))]))
      .select('id', 'title')
      .all(),
    getDb()
      .orm.public.Batch.where((b) =>
        b.id.in([...new Set(assignments.map((a) => a.batchId).filter((x): x is string => x !== null))]),
      )
      .select('id', 'batchNumber')
      .all(),
    getUsersByIds([...new Set(assignments.map((a) => a.createdBy))]),
    getDb()
      .orm.public.AssignmentSubmission.where((s) =>
        s.assignmentId.in(assignments.map((a) => a.id)),
      )
      .select('assignmentId', 'status')
      .all(),
  ]);
  const courseTitle = new Map(courses.map((c) => [c.id, c.title]));
  const batchLabel = new Map(batches.map((b) => [b.id, formatBatchLabel(b.batchNumber)]));
  const counts = new Map<string, { total: number; graded: number }>();
  for (const s of submissions) {
    const c = counts.get(s.assignmentId) ?? { total: 0, graded: 0 };
    c.total += 1;
    if (s.status === 'graded') c.graded += 1;
    counts.set(s.assignmentId, c);
  }
  return assignments.map((a) => ({
    ...a,
    courseTitle: courseTitle.get(a.courseId),
    batchLabel: a.batchId ? (batchLabel.get(a.batchId) ?? null) : null,
    creatorName: creators.get(a.createdBy)?.name,
    submissionCount: counts.get(a.id)?.total ?? 0,
    gradedCount: counts.get(a.id)?.graded ?? 0,
  }));
}

/**
 * Assignments for a set of courses, enriched with the course title,
 * batch label, creator name, and submission/graded counts. Used by the
 * instructor list.
 */
export async function listAssignmentsEnriched(courseIds: string[]): Promise<Assignment[]> {
  return enrichAssignments(await listAssignmentsByCourseIds(courseIds));
}

/**
 * Submissions for one assignment, enriched with the student name/email,
 * the grader name, the assignment title/max marks, and the late flag.
 * Used by the instructor and admin detail views.
 */
export async function listSubmissionsEnriched(
  assignmentId: string,
): Promise<AssignmentSubmission[]> {
  const assignment = await getAssignmentById(assignmentId);
  if (!assignment) return [];
  const submissions = await listSubmissionsByAssignment(assignmentId);
  if (submissions.length === 0) return submissions;
  const studentIds = [...new Set(submissions.map((s) => s.studentId))];
  const graderIds = [...new Set(submissions.map((s) => s.gradedBy).filter((x): x is string => x !== null))];
  const [students, graders] = await Promise.all([
    getUsersByIds(studentIds),
    getUsersByIds(graderIds),
  ]);
  return submissions.map((s) => ({
    ...s,
    assignmentTitle: assignment.title,
    maxMarks: assignment.maxMarks,
    dueDate: assignment.dueDate,
    studentName: students.get(s.studentId)?.name,
    studentEmail: students.get(s.studentId)?.email,
    graderName: s.gradedBy ? (graders.get(s.gradedBy)?.name ?? null) : null,
  }));
}
