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
    paymentStatus: input.paymentStatus,
    amountPaid: input.amountPaid,
    couponUsed: input.couponUsed ?? null,
  });
  return { enrollment: mapEnrollmentRow(row, []) };
}

/** Mark one lesson complete for an enrolment (idempotent). */
export async function markLessonComplete(
  enrollmentId: string,
  lessonId: string,
): Promise<{ ok: true } | { error: string }> {
  const enrollment = await getDb()
    .orm.public.Enrollment.where({ id: enrollmentId })
    .where((e) => e.deletedAt.isNull())
    .first();
  if (!enrollment) return { error: 'Enrollment not found' };
  const lesson = await getDb().orm.public.Lesson.where({ id: lessonId }).first();
  if (!lesson) return { error: 'Lesson not found' };
  const existing = await getDb()
    .orm.public.LessonProgress.where({ enrollmentId, lessonId })
    .first();
  if (existing) return { ok: true };
  await getDb().orm.public.LessonProgress.create({ enrollmentId, lessonId });
  return { ok: true };
}

export interface UpdateEnrollmentInput {
  isCompleted?: boolean;
  completedAt?: string | null;
  paymentStatus?: EnrollmentPaymentStatus;
  amountPaid?: number;
  certificateEligible?: boolean | null;
}

/** Update an enrolment. Returns null when it does not exist (or is soft-deleted). */
export async function updateEnrollment(id: string, input: UpdateEnrollmentInput): Promise<Enrollment | null> {
  const data: Record<string, unknown> = {};
  if (input.isCompleted !== undefined) data.isCompleted = input.isCompleted;
  if (input.completedAt !== undefined) data.completedAt = stringToDate(input.completedAt);
  if (input.paymentStatus !== undefined) data.paymentStatus = input.paymentStatus;
  if (input.amountPaid !== undefined) data.amountPaid = input.amountPaid;
  if (input.certificateEligible !== undefined) data.certificateEligible = input.certificateEligible;
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
  page?: string | string[];
  limit?: string | string[];
}

/** Paginated enrolment list (admin / instructor scoping happens in the route). */
export async function listEnrollments(opts: ListEnrollmentsOptions = {}): Promise<Page<Enrollment>> {
  const params = parsePageParams({ page: opts.page, limit: opts.limit });
  let query = getDb().orm.public.Enrollment.where((e) => e.deletedAt.isNull());
  if (opts.studentId) query = query.where({ studentId: opts.studentId });
  if (opts.courseId) query = query.where({ courseId: opts.courseId });
  const total = (await query.all()).length;
  const rows = await query.orderBy((e) => e.enrolledAt.desc()).limit(params.limit).offset(params.offset).all();
  const progress = await progressFor(rows.map((r) => r.id));
  const items = rows.map((r) => mapEnrollmentRow(r, progress));
  return toPage(items, total, params);
}
