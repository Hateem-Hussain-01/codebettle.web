/**
 * Review repository (Phase 2, Prisma-backed).
 * Same function names as the old lib/data/reviews.ts.
 *
 * Course Reviews (student-submitted, moderated): the Review model gained
 * title / status / updatedAt in migration
 * 20261114T1428_add_course_review_moderation. Until that SQL runs, the
 * reads below fall back to the pre-migration columns (legacy select) so
 * the course page and student page never crash — a review then reads as
 * approved with updatedAt = createdAt (see mapReviewRow). The public
 * course page only ever reads APPROVED reviews.
 */
import { getDb } from './client';
import { isMissingColumnError } from './certificates';
import { mapReviewRow } from './mappers';
import type { Review, ReviewStatus } from './types';

/** Columns the pre-moderation Review table lacks. */
const NEW_REVIEW_COLUMNS = ['title', 'status', 'updatedAt'];

/** Columns that existed before the moderation migration. */
const LEGACY_REVIEW_FIELDS = ['id', 'studentId', 'courseId', 'rating', 'comment', 'createdAt'] as const;

/**
 * Run a review read, retrying without the newer columns when the
 * migration has not run yet. Same shape as withCertificateColumnFallback
 * in lib/db/certificates.ts.
 */
async function withReviewColumnFallback<T>(
  fetch: (legacyOnly: boolean) => Promise<T>,
): Promise<T> {
  try {
    return await fetch(false);
  } catch (error) {
    if (!isMissingColumnError(error, NEW_REVIEW_COLUMNS)) throw error;
    return fetch(true);
  }
}

export async function getReviewsByCourse(courseId: string): Promise<Review[]> {
  const rows = await withReviewColumnFallback(async (legacyOnly) => {
    const base = getDb().orm.public.Review.where({ courseId });
    return legacyOnly
      ? base.select(...LEGACY_REVIEW_FIELDS).orderBy((r) => r.createdAt.desc()).all()
      : base.orderBy((r) => r.createdAt.desc()).all();
  });
  return rows.map(mapReviewRow);
}

/** Only APPROVED reviews — the public course page reads through this. */
export async function getApprovedReviewsByCourse(courseId: string): Promise<Review[]> {
  const rows = await withReviewColumnFallback(async (legacyOnly) => {
    const base = getDb().orm.public.Review.where({ courseId });
    if (legacyOnly) {
      // No status column yet: every stored review was public from the start.
      return base.select(...LEGACY_REVIEW_FIELDS).orderBy((r) => r.createdAt.desc()).all();
    }
    return base.where({ status: 'approved' }).orderBy((r) => r.createdAt.desc()).all();
  });
  return rows.map(mapReviewRow);
}

/**
 * Fetch reviews for several courses in ONE query (Phase 7 perf —
 * replaces the per-course getReviewsByCourse loops in the instructor
 * dashboard / reviews pages).
 */
export async function getReviewsByCourseIds(courseIds: string[]): Promise<Review[]> {
  const unique = [...new Set(courseIds)];
  if (unique.length === 0) return [];
  const rows = await withReviewColumnFallback(async (legacyOnly) => {
    const base = getDb().orm.public.Review.where((r) => r.courseId.in(unique));
    return legacyOnly
      ? base.select(...LEGACY_REVIEW_FIELDS).orderBy((r) => r.createdAt.desc()).all()
      : base.orderBy((r) => r.createdAt.desc()).all();
  });
  return rows.map(mapReviewRow);
}

export async function getReviewsByStudent(studentId: string): Promise<Review[]> {
  const rows = await withReviewColumnFallback(async (legacyOnly) => {
    const base = getDb().orm.public.Review.where({ studentId });
    return legacyOnly
      ? base.select(...LEGACY_REVIEW_FIELDS).orderBy((r) => r.createdAt.desc()).all()
      : base.orderBy((r) => r.createdAt.desc()).all();
  });
  return rows.map(mapReviewRow);
}

export async function listReviews(): Promise<Review[]> {
  const rows = await withReviewColumnFallback(async (legacyOnly) => {
    const base = getDb().orm.public.Review;
    return legacyOnly
      ? base.select(...LEGACY_REVIEW_FIELDS).orderBy((r) => r.createdAt.desc()).all()
      : base.orderBy((r) => r.createdAt.desc()).all();
  });
  return rows.map(mapReviewRow);
}

/** Admin moderation list: all reviews in one status, newest first. */
export async function getReviewsByStatus(status: ReviewStatus): Promise<Review[]> {
  const rows = await withReviewColumnFallback(async (legacyOnly) => {
    const base = getDb().orm.public.Review;
    if (legacyOnly) {
      // No status column yet: everything stored is effectively approved.
      return status === 'approved'
        ? base.select(...LEGACY_REVIEW_FIELDS).orderBy((r) => r.createdAt.desc()).all()
        : [];
    }
    return base.where({ status }).orderBy((r) => r.createdAt.desc()).all();
  });
  return rows.map(mapReviewRow);
}

export async function getReviewByStudentAndCourse(studentId: string, courseId: string): Promise<Review | null> {
  const row = await withReviewColumnFallback(async (legacyOnly) => {
    const base = getDb().orm.public.Review.where({ studentId, courseId });
    return legacyOnly ? base.select(...LEGACY_REVIEW_FIELDS).first() : base.first();
  });
  if (!row) return null;
  return mapReviewRow(row);
}

export async function getReviewById(id: string): Promise<Review | null> {
  const row = await withReviewColumnFallback(async (legacyOnly) => {
    const base = getDb().orm.public.Review.where({ id });
    return legacyOnly ? base.select(...LEGACY_REVIEW_FIELDS).first() : base.first();
  });
  if (!row) return null;
  return mapReviewRow(row);
}

export interface CreateReviewInput {
  studentId: string;
  courseId: string;
  rating: number;
  title?: string | null;
  comment: string;
  /** New reviews start pending (admin approval) unless the caller says otherwise. */
  status?: ReviewStatus;
}

/** Create a review. Rejects a second review by the same student for the same course. */
export async function createReview(
  input: CreateReviewInput,
): Promise<{ review: Review } | { error: string }> {
  if (await getReviewByStudentAndCourse(input.studentId, input.courseId)) {
    return { error: 'You have already reviewed this course' };
  }
  const row = await getDb().orm.public.Review.create({
    studentId: input.studentId,
    courseId: input.courseId,
    rating: input.rating,
    title: input.title ?? null,
    comment: input.comment,
    status: input.status ?? 'pending',
  });
  return { review: mapReviewRow(row) };
}

export interface UpdateReviewInput {
  rating?: number;
  title?: string | null;
  comment?: string;
  status?: ReviewStatus;
}

/** Update a review's fields. Returns the updated review, or null when missing. */
export async function updateReview(id: string, input: UpdateReviewInput): Promise<Review | null> {
  const existing = await getReviewById(id);
  if (!existing) return null;
  const data = {
    ...(input.rating !== undefined ? { rating: input.rating } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.comment !== undefined ? { comment: input.comment } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };
  if (Object.keys(data).length === 0) return existing;
  const updated = await getDb().orm.public.Review.where({ id }).update(data);
  if (!updated) return null;
  return mapReviewRow(updated);
}

export async function deleteReview(id: string): Promise<boolean> {
  const row = await getDb().orm.public.Review.where({ id }).first();
  if (!row) return false;
  await getDb().orm.public.Review.where({ id }).delete();
  return true;
}

/**
 * True when the moderation columns exist (the SQL has run). The admin
 * Course Reviews page shows its "run the SQL" state when this is false.
 * A select of the new columns throws Postgres 42703 when they are missing.
 */
export async function areReviewModerationColumnsReady(): Promise<boolean> {
  try {
    await getDb().orm.public.Review.select('id', 'status').limit(1).all();
    return true;
  } catch (error) {
    if (isMissingColumnError(error, NEW_REVIEW_COLUMNS)) return false;
    throw error;
  }
}
