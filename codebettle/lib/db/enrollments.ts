/**
 * Enrollment repository (Phase 2, Prisma-backed).
 *
 * Same function names as the old lib/data/enrollments.ts. Lesson progress
 * lives in the LessonProgress table (composite key enrollment+lesson);
 * completedLessons is assembled from it. The unique (student, course)
 * enrolment is enforced by the database — createEnrollment checks first
 * and returns a clear error, the constraint is the backstop.
 */
import { getDb } from './client';
import { mapEnrollmentRow, stringToDate, stripUndefined } from './mappers';
import { parsePageParams, toPage, type Page } from './pagination';
import type { Enrollment, EnrollmentPaymentStatus } from './types';

async function progressFor(enrollmentIds: string[]) {
  if (enrollmentIds.length === 0) return [];
  return getDb()
    .orm.public.LessonProgress.where((p) => p.enrollmentId.in(enrollmentIds))
    .all();
}

export async function getEnrollmentsByStudent(studentId: string): Promise<Enrollment[]> {
  const rows = await getDb()
    .orm.public.Enrollment.where({ studentId })
    .where((e) => e.deletedAt.isNull())
    .orderBy((e) => e.enrolledAt.desc())
    .all();
  const progress = await progressFor(rows.map((r) => r.id));
  return rows.map((r) => mapEnrollmentRow(r, progress));
}

export async function getEnrollmentsByCourse(courseId: string): Promise<Enrollment[]> {
  const rows = await getDb()
    .orm.public.Enrollment.where({ courseId })
    .where((e) => e.deletedAt.isNull())
    .orderBy((e) => e.enrolledAt.desc())
    .all();
  const progress = await progressFor(rows.map((r) => r.id));
  return rows.map((r) => mapEnrollmentRow(r, progress));
}

/** Enrolments in one batch (the batch detail view). Empty when the batch has no enrolments. */
export async function getEnrollmentsByBatch(batchId: string): Promise<Enrollment[]> {
  let rows;
  try {
    rows = await getDb()
      .orm.public.Enrollment.where({ batchId })
      .where((e) => e.deletedAt.isNull())
      .orderBy((e) => e.enrolledAt.desc())
      .all();
  } catch (error) {
    // The batchId column arrives with the batch migration — before it
    // runs there are no batch enrolments to list.
    if (error && typeof error === 'object') {
      const code = (error as { code?: unknown }).code;
      const text = typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : '';
      const namesColumn = text.includes('"batchId"') || text.includes('batchId');
      if ((code === '42703' && namesColumn) || (/column .* does not exist/i.test(text) && namesColumn)) {
        return [];
      }
    }
    throw error;
  }
  const progress = await progressFor(rows.map((r) => r.id));
  return rows.map((r) => mapEnrollmentRow(r, progress));
}

/**
 * Fetch enrolments for several courses in ONE query (Phase 7 perf —
 * replaces the per-course getEnrollmentsByCourse loops in the
 * instructor dashboard / students pages). Progress is loaded in one
 * query too, as in getEnrollmentsByCourse.
 */
export async function getEnrollmentsByCourseIds(courseIds: string[]): Promise<Enrollment[]> {
  const unique = [...new Set(courseIds)];
  if (unique.length === 0) return [];
  const rows = await getDb()
    .orm.public.Enrollment.where((e) => e.courseId.in(unique))
    .where((e) => e.deletedAt.isNull())
    .orderBy((e) => e.enrolledAt.desc())
    .all();
  const progress = await progressFor(rows.map((r) => r.id));
  return rows.map((r) => mapEnrollmentRow(r, progress));
}

export async function getCompletedEnrollments(studentId: string): Promise<Enrollment[]> {
  const all = await getEnrollmentsByStudent(studentId);
  return all.filter((e) => e.isCompleted);
}

export async function isEnrolled(studentId: string, courseId: string): Promise<boolean> {
  const row = await getDb()
    .orm.public.Enrollment.where({ studentId, courseId })
    .where((e) => e.deletedAt.isNull())
    .first();
  return row !== null;
}

/**
 * The one enrolment for a student in a course, or null. The payment gates
 * (quiz start, reviews) need the enrolment's paymentStatus, not just its
 * existence — isEnrolled alone cannot answer that.
 */
export async function getEnrollmentByStudentAndCourse(
  studentId: string,
  courseId: string,
): Promise<Enrollment | null> {
  const row = await getDb()
    .orm.public.Enrollment.where({ studentId, courseId })
    .where((e) => e.deletedAt.isNull())
    .first();
  if (!row) return null;
  const progress = await progressFor([row.id]);
  return mapEnrollmentRow(row, progress);
}

export async function getEnrollmentById(id: string): Promise<Enrollment | null> {
  const row = await getDb()
    .orm.public.Enrollment.where({ id })
    .where((e) => e.deletedAt.isNull())
    .first();
  if (!row) return null;
  const progress = await progressFor([row.id]);
  return mapEnrollmentRow(row, progress);
}

export interface CreateEnrollmentInput {
  studentId: string;
  courseId: string;
  /** Batch the student enrols in (undefined = pre-batch enrolment, no batch linked). */
  batchId?: string;
  paymentStatus: 'paid' | 'free' | 'pending';
  amountPaid: number;
  couponUsed?: string;
}

/** Create an enrolment. Rejects duplicates (one enrolment per student+course). */
export async function createEnrollment(
  input: CreateEnrollmentInput,
): Promise<{ enrollment: Enrollment } | { error: string }> {
  if (await isEnrolled(input.studentId, input.courseId)) {
    return { error: 'Student is already enrolled in this course' };
  }
  const row = await getDb().orm.public.Enrollment.create({
    studentId: input.studentId,
    courseId: input.courseId,
    // Only send batchId when one is actually linked (same shape as
    // createCourse's certificateTemplateHtml): a plain create must not
    // fail with 42703 before the batch migration runs.
    ...(input.batchId ? { batchId: input.batchId } : {}),
    paymentStatus: input.paymentStatus,
    amountPaid: input.amountPaid,
    couponUsed: input.couponUsed ?? null,
  });
  return { enrollment: mapEnrollmentRow(row, []) };
}

/**
 * Shared ownership check for lesson-progress writes (S-1 defense in
 * depth): the enrolment must belong to the expected student (when one
 * is given) and the lesson must belong to that enrolment's course
 * (via its module). A future mis-wired route that passes a bare
 * enrolment id cannot mark progress for another student or course.
 * Returns an error string, or null when the checks pass.
 */
async function checkProgressOwnership(
  enrollment: { id: string; studentId: string; courseId: string },
  lessonId: string,
  opts?: { studentId?: string; courseId?: string },
): Promise<string | null> {
  if (opts?.studentId && enrollment.studentId !== opts.studentId) {
    return 'Enrollment does not belong to this student';
  }
  const lesson = await getDb().orm.public.Lesson.where({ id: lessonId }).first();
  if (!lesson) return 'Lesson not found';
  const expectedCourseId = opts?.courseId ?? enrollment.courseId;
  const moduleRow = await getDb().orm.public.Module.where({ id: lesson.moduleId }).first();
  if (!moduleRow || moduleRow.courseId !== expectedCourseId || moduleRow.courseId !== enrollment.courseId) {
    return 'Lesson does not belong to this course';
  }
  return null;
}

/** Mark one lesson complete for an enrolment (idempotent). */
export async function markLessonComplete(
  enrollmentId: string,
  lessonId: string,
  opts?: { studentId?: string; courseId?: string },
): Promise<{ ok: true } | { error: string }> {
  const enrollment = await getDb()
    .orm.public.Enrollment.where({ id: enrollmentId })
    .where((e) => e.deletedAt.isNull())
    .first();
  if (!enrollment) return { error: 'Enrollment not found' };
  const ownershipError = await checkProgressOwnership(enrollment, lessonId, opts);
  if (ownershipError) return { error: ownershipError };
  const existing = await getDb()
    .orm.public.LessonProgress.where({ enrollmentId, lessonId })
    .first();
  if (existing) return { ok: true };
  await getDb().orm.public.LessonProgress.create({ enrollmentId, lessonId });
  return { ok: true };
}

/**
 * Unmark one lesson complete for an enrolment (idempotent — ok even
 * when the lesson was not marked complete). The LessonProgress row is
 * deleted; the enrolment and the lesson are untouched.
 */
export async function unmarkLessonComplete(
  enrollmentId: string,
  lessonId: string,
  opts?: { studentId?: string; courseId?: string },
): Promise<{ ok: true } | { error: string }> {
  const enrollment = await getDb()
    .orm.public.Enrollment.where({ id: enrollmentId })
    .where((e) => e.deletedAt.isNull())
    .first();
  if (!enrollment) return { error: 'Enrollment not found' };
  const ownershipError = await checkProgressOwnership(enrollment, lessonId, opts);
  if (ownershipError) return { error: ownershipError };
  await getDb().orm.public.LessonProgress.where({ enrollmentId, lessonId }).delete();
  return { ok: true };
}

export interface UpdateEnrollmentInput {
  isCompleted?: boolean;
  completedAt?: string | null;
  paymentStatus?: EnrollmentPaymentStatus;
  amountPaid?: number;
  certificateEligible?: boolean | null;
  /** Move the enrolment to another batch (null clears the batch link). */
  batchId?: string | null;
}

/** Update an enrolment. Returns null when it does not exist (or is soft-deleted). */
export async function updateEnrollment(id: string, input: UpdateEnrollmentInput): Promise<Enrollment | null> {
  const data: Record<string, unknown> = {};
  if (input.isCompleted !== undefined) data.isCompleted = input.isCompleted;
  if (input.completedAt !== undefined) data.completedAt = stringToDate(input.completedAt);
  if (input.paymentStatus !== undefined) data.paymentStatus = input.paymentStatus;
  if (input.amountPaid !== undefined) data.amountPaid = input.amountPaid;
  if (input.certificateEligible !== undefined) data.certificateEligible = input.certificateEligible;
  if (input.batchId !== undefined) data.batchId = input.batchId;
  const row = await getDb()
    .orm.public.Enrollment.where({ id })
    .where((e) => e.deletedAt.isNull())
    .update(stripUndefined(data));
  if (!row) return null;
  return getEnrollmentById(id);
}

/** Soft delete: sets deletedAt. Returns false when the enrolment does not exist or is already deleted. */
export async function softDeleteEnrollment(id: string): Promise<boolean> {
  const row = await getDb()
    .orm.public.Enrollment.where({ id })
    .where((e) => e.deletedAt.isNull())
    .update({ deletedAt: new Date() });
  return row !== null;
}

export interface ListEnrollmentsOptions {
  studentId?: string;
  courseId?: string;
  batchId?: string;
  page?: string | string[];
  limit?: string | string[];
}

/** Paginated enrolment list (admin / instructor scoping happens in the route). */
export async function listEnrollments(opts: ListEnrollmentsOptions = {}): Promise<Page<Enrollment>> {
  const params = parsePageParams({ page: opts.page, limit: opts.limit });
  let query = getDb().orm.public.Enrollment.where((e) => e.deletedAt.isNull());
  if (opts.studentId) query = query.where({ studentId: opts.studentId });
  if (opts.courseId) query = query.where({ courseId: opts.courseId });
  if (opts.batchId) query = query.where({ batchId: opts.batchId });
  const total = (await query.all()).length;
  const rows = await query.orderBy((e) => e.enrolledAt.desc()).limit(params.limit).offset(params.offset).all();
  const progress = await progressFor(rows.map((r) => r.id));
  const items = rows.map((r) => mapEnrollmentRow(r, progress));
  return toPage(items, total, params);
}
