/**
 * Review repository (Phase 2, Prisma-backed).
 * Same function names as the old lib/data/reviews.ts.
 */
import { getDb } from './client';
import { mapReviewRow } from './mappers';
import type { Review } from './types';

export async function getReviewsByCourse(courseId: string): Promise<Review[]> {
  const rows = await getDb()
    .orm.public.Review.where({ courseId })
    .orderBy((r) => r.createdAt.desc())
    .all();
  return rows.map(mapReviewRow);
}

export async function getReviewsByStudent(studentId: string): Promise<Review[]> {
  const rows = await getDb()
    .orm.public.Review.where({ studentId })
    .orderBy((r) => r.createdAt.desc())
    .all();
  return rows.map(mapReviewRow);
}

export async function listReviews(): Promise<Review[]> {
  const rows = await getDb()
    .orm.public.Review.orderBy((r) => r.createdAt.desc())
    .all();
  return rows.map(mapReviewRow);
}

export async function getReviewByStudentAndCourse(studentId: string, courseId: string): Promise<Review | null> {
  const row = await getDb()
    .orm.public.Review.where({ studentId, courseId })
    .first();
  if (!row) return null;
  return mapReviewRow(row);
}

export async function getReviewById(id: string): Promise<Review | null> {
  const row = await getDb().orm.public.Review.where({ id }).first();
  if (!row) return null;
  return mapReviewRow(row);
}

export interface CreateReviewInput {
  studentId: string;
  courseId: string;
  rating: number;
  comment: string;
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
    comment: input.comment,
  });
  return { review: mapReviewRow(row) };
}

export async function deleteReview(id: string): Promise<boolean> {
  const row = await getDb().orm.public.Review.where({ id }).first();
  if (!row) return false;
  await getDb().orm.public.Review.where({ id }).delete();
  return true;
}
