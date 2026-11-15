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
 *
 * Course Reviews (moderated): a new review starts `pending` and only
 * counts toward the course rating — and only shows on the public course
 * page — once an admin approves it. Editing your own review sends it
 * back to `pending`. Admin approve/reject/edit/delete live in the
 * Course Reviews admin section (consistent with Success Stories).
 */
import { getCourseById, updateCourse } from '../db/courses';
import { getEnrollmentByStudentAndCourse } from '../db/enrollments';
import {
  createReview,
  deleteReview,
  getApprovedReviewsByCourse,
  getReviewById,
  updateReview,
} from '../db/reviews';
import { logAudit } from '../db/audit';
import { hasAdminCapability } from '../rbac';
import { toPublicCourse } from '../db/mappers';
import type { Course, PublicCourse, Review, ReviewStatus } from '../db/types';
import { badRequest, conflict, forbidden, notFound, type Actor, type ServiceError } from './errors';

type Result<T> = T | ServiceError;

/** Recompute a course's rating + reviewCount from its APPROVED reviews only. */
export async function recomputeCourseRating(courseId: string): Promise<Course | null> {
  const reviews = await getApprovedReviewsByCourse(courseId);
  const count = reviews.length;
  const rating = count === 0 ? 0 : Math.round((reviews.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10;
  return updateCourse(courseId, { rating, reviewCount: count });
}

export interface CreateReviewServiceInput {
  courseId: string;
  rating: number;
  title?: string;
  comment: string;
}

export async function createReviewService(
  actor: Actor,
  input: CreateReviewServiceInput,
): Promise<Result<{ review: Review; course: PublicCourse | null }>> {
  if (actor.role !== 'student') {
    return forbidden('Only students can write reviews');
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return badRequest('Rating must be a whole number from 1 to 5');
  }
  const title = (input.title ?? '').trim();
  if (title.length > 200) {
    return badRequest('Review title is too long (max 200 characters)');
  }
  const comment = input.comment.trim();
  if (!comment || comment.length > 2000) {
    return badRequest('Review text is required (max 2000 characters)');
  }
  const course = await getCourseById(input.courseId);
  if (!course) return notFound('Course');
  // SECURITY (STU-03): a review is social proof that the student took
  // the course — it requires a VERIFIED payment, not just an enrolment.
  // A pending-payment enrolment may not review (it also may not see the
  // paid content yet, so its review would be meaningless).
  const enrollment = await getEnrollmentByStudentAndCourse(actor.id, input.courseId);
  if (!enrollment) {
    return forbidden('You can only review a course you are enrolled in');
  }
  if (enrollment.paymentStatus !== 'paid' && enrollment.paymentStatus !== 'free') {
    return forbidden('You can only review a course after your payment is verified');
  }
  const created = await createReview({
    studentId: actor.id,
    courseId: input.courseId,
    rating: input.rating,
    title: title || null,
    comment,
    status: 'pending',
  });
  if ('error' in created) return conflict(created.error);
  await logAudit({
    actorId: actor.id,
    action: 'review.create',
    entity: 'review',
    entityId: created.review.id,
    detail: `${input.courseId} rating ${input.rating}`,
  });
  // Pending reviews do not count yet; recompute is a no-op until approval,
  // but it keeps the course stats honest if the moderation columns are
  // not live yet (legacy rows read as approved).
  const updatedCourse = await recomputeCourseRating(input.courseId);
  // SECURITY (S-2): never return the full internal Course row to a
  // student — it carries zoomLink and the instructor-portal urlKey.
  // The public shape keeps rating/reviewCount (what the client needs).
  return { review: created.review, course: updatedCourse ? toPublicCourse(updatedCourse) : null };
}

export interface UpdateReviewServiceInput {
  rating?: number;
  title?: string;
  comment?: string;
}

/** A student edits their own review. The edited review goes back to pending. */
export async function updateReviewService(
  actor: Actor,
  reviewId: string,
  input: UpdateReviewServiceInput,
): Promise<Result<{ review: Review; course: PublicCourse | null }>> {
  if (actor.role !== 'student') {
    return forbidden('Only students can edit reviews');
  }
  const existing = await getReviewById(reviewId);
  if (!existing) return notFound('Review');
  if (existing.studentId !== actor.id) {
    return forbidden('You can only edit your own reviews');
  }
  if (input.rating !== undefined && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
    return badRequest('Rating must be a whole number from 1 to 5');
  }
  const title = input.title !== undefined ? input.title.trim() : undefined;
  if (title !== undefined && title.length > 200) {
    return badRequest('Review title is too long (max 200 characters)');
  }
  const comment = input.comment !== undefined ? input.comment.trim() : undefined;
  if (comment !== undefined && (!comment || comment.length > 2000)) {
    return badRequest('Review text is required (max 2000 characters)');
  }
  const updated = await updateReview(reviewId, {
    ...(input.rating !== undefined ? { rating: input.rating } : {}),
    ...(title !== undefined ? { title: title || null } : {}),
    ...(comment !== undefined ? { comment } : {}),
    status: 'pending',
  });
  if (!updated) return notFound('Review');
  await logAudit({
    actorId: actor.id,
    action: 'review.update',
    entity: 'review',
    entityId: reviewId,
    detail: `${existing.courseId} rating ${updated.rating} (back to pending)`,
  });
  const updatedCourse = await recomputeCourseRating(existing.courseId);
  // SECURITY (S-2): public shape only — see createReviewService.
  return { review: updated, course: updatedCourse ? toPublicCourse(updatedCourse) : null };
}

export async function deleteReviewService(
  actor: Actor,
  reviewId: string,
): Promise<Result<{ success: true; course: PublicCourse | null }>> {
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
  // SECURITY (S-2): public shape only — see createReviewService.
  return { success: true, course: updatedCourse ? toPublicCourse(updatedCourse) : null };
}

// ---------------------------------------------------------------------------
// Admin moderation (Course Reviews admin section)
// ---------------------------------------------------------------------------

function requireAdmin(actor: Actor): ServiceError | null {
  // SECURITY (NEW-13): capability flags, not the primary role — a
  // flag-admin (isAdmin, primary role instructor) must be able to
  // moderate reviews, matching the route guard.
  if (!hasAdminCapability(actor)) return forbidden('Only admins can moderate reviews');
  return null;
}

async function setReviewStatus(
  actor: Actor,
  reviewId: string,
  status: ReviewStatus,
): Promise<Result<{ review: Review; course: Course | null }>> {
  const blocked = requireAdmin(actor);
  if (blocked) return blocked;
  const existing = await getReviewById(reviewId);
  if (!existing) return notFound('Review');
  const updated = await updateReview(reviewId, { status });
  if (!updated) return notFound('Review');
  await logAudit({
    actorId: actor.id,
    action: status === 'approved' ? 'review.approve' : 'review.reject',
    entity: 'review',
    entityId: reviewId,
    detail: `${existing.courseId} rating ${existing.rating}`,
  });
  const updatedCourse = await recomputeCourseRating(existing.courseId);
  return { review: updated, course: updatedCourse };
}

export async function approveReviewService(
  actor: Actor,
  reviewId: string,
): Promise<Result<{ review: Review; course: Course | null }>> {
  return setReviewStatus(actor, reviewId, 'approved');
}

export async function rejectReviewService(
  actor: Actor,
  reviewId: string,
): Promise<Result<{ review: Review; course: Course | null }>> {
  return setReviewStatus(actor, reviewId, 'rejected');
}

export interface AdminUpdateReviewInput {
  rating?: number;
  title?: string;
  comment?: string;
  status?: ReviewStatus;
}

/** Admin edits a review before publishing (text, title, rating, status). */
export async function adminUpdateReviewService(
  actor: Actor,
  reviewId: string,
  input: AdminUpdateReviewInput,
): Promise<Result<{ review: Review; course: Course | null }>> {
  const blocked = requireAdmin(actor);
  if (blocked) return blocked;
  const existing = await getReviewById(reviewId);
  if (!existing) return notFound('Review');
  if (input.rating !== undefined && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
    return badRequest('Rating must be a whole number from 1 to 5');
  }
  const title = input.title !== undefined ? input.title.trim() : undefined;
  if (title !== undefined && title.length > 200) {
    return badRequest('Review title is too long (max 200 characters)');
  }
  const comment = input.comment !== undefined ? input.comment.trim() : undefined;
  if (comment !== undefined && (!comment || comment.length > 2000)) {
    return badRequest('Review text is required (max 2000 characters)');
  }
  const updated = await updateReview(reviewId, {
    ...(input.rating !== undefined ? { rating: input.rating } : {}),
    ...(title !== undefined ? { title: title || null } : {}),
    ...(comment !== undefined ? { comment } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
  if (!updated) return notFound('Review');
  await logAudit({
    actorId: actor.id,
    action: 'review.admin_update',
    entity: 'review',
    entityId: reviewId,
    detail: `${existing.courseId} status ${updated.status}`,
  });
  const updatedCourse = await recomputeCourseRating(existing.courseId);
  return { review: updated, course: updatedCourse };
}

export async function adminDeleteReviewService(
  actor: Actor,
  reviewId: string,
): Promise<Result<{ success: true; course: Course | null }>> {
  const blocked = requireAdmin(actor);
  if (blocked) return blocked;
  const existing = await getReviewById(reviewId);
  if (!existing) return notFound('Review');
  const removed = await deleteReview(reviewId);
  if (!removed) return notFound('Review');
  await logAudit({
    actorId: actor.id,
    action: 'review.admin_delete',
    entity: 'review',
    entityId: reviewId,
    detail: `${existing.courseId} rating ${existing.rating}`,
  });
  const updatedCourse = await recomputeCourseRating(existing.courseId);
  return { success: true, course: updatedCourse };
}
