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
