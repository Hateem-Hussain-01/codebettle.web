/**
 * Student review service (Phase 7).
 *
 * Before Phase 7 the student reviews page faked submit/delete in
 * local state, and nothing ever updated Course.rating / reviewCount
 * (CB-12 rating drift — the displayed rating was seed data forever).
 * Reviews are now real: a student may review only a course they are
 * enrolled in, once per course; deleting a review recomputes the
 * course stats too. The course rating is the mean of all its reviews,
 * rounded to one decimal; with no reviews it is 0 with count 0.
 */
import { getCourseById, updateCourse } from '../db/courses';
import { isEnrolled } from '../db/enrollments';
import { createReview, deleteReview, getReviewById, getReviewsByCourse } from '../db/reviews';
import { logAudit } from '../db/audit';
import type { Course, Review } from '../db/types';
import { badRequest, conflict, forbidden, notFound, type Actor, type ServiceError } from './errors';

type Result<T> = T | ServiceError;

/** Recompute a course's rating + reviewCount from its stored reviews. */
export async function recomputeCourseRating(courseId: string): Promise<Course | null> {
  const reviews = await getReviewsByCourse(courseId);
  const count = reviews.length;
  const rating = count === 0 ? 0 : Math.round((reviews.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10;
  return updateCourse(courseId, { rating, reviewCount: count });
}

export interface CreateReviewServiceInput {
  courseId: string;
  rating: number;
  comment: string;
}

export async function createReviewService(
  actor: Actor,
  input: CreateReviewServiceInput,
): Promise<Result<{ review: Review; course: Course | null }>> {
  if (actor.role !== 'student') {
    return forbidden('Only students can write reviews');
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return badRequest('Rating must be a whole number from 1 to 5');
  }
  const comment = input.comment.trim();
  if (!comment || comment.length > 2000) {
    return badRequest('Review text is required (max 2000 characters)');
  }
  const course = await getCourseById(input.courseId);
  if (!course) return notFound('Course');
  if (!(await isEnrolled(actor.id, input.courseId))) {
    return forbidden('You can only review a course you are enrolled in');
  }
  const created = await createReview({
    studentId: actor.id,
    courseId: input.courseId,
    rating: input.rating,
    comment,
  });
  if ('error' in created) return conflict(created.error);
  await logAudit({
    actorId: actor.id,
    action: 'review.create',
    entity: 'review',
    entityId: created.review.id,
    detail: `${input.courseId} rating ${input.rating}`,
  });
  const updatedCourse = await recomputeCourseRating(input.courseId);
  return { review: created.review, course: updatedCourse };
}

export async function deleteReviewService(
  actor: Actor,
  reviewId: string,
): Promise<Result<{ success: true; course: Course | null }>> {
  if (actor.role !== 'student') {
    return forbidden('Only students can delete reviews');
  }
  const existing = await getReviewById(reviewId);
  if (!existing) return notFound('Review');
  if (existing.studentId !== actor.id) {
    return forbidden('You can only delete your own reviews');
  }
  const removed = await deleteReview(reviewId);
  if (!removed) return notFound('Review');
  await logAudit({
    actorId: actor.id,
    action: 'review.delete',
    entity: 'review',
    entityId: reviewId,
  });
  const updatedCourse = await recomputeCourseRating(existing.courseId);
  return { success: true, course: updatedCourse };
}
