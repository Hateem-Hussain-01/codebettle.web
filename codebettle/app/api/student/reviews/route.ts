import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { createReviewService } from '@/lib/services/review-service';

/**
 * POST /api/student/reviews — write a review (Phase 7, student only).
 * Body: { courseId: string, rating: 1-5, comment: string }.
 * One review per student per course, and only for courses the student
 * is enrolled in. The course rating + reviewCount are recomputed from
 * the stored reviews (CB-12 fix — the displayed rating was seed data).
 */
const reviewSchema = z.object({
  courseId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(1).max(2000),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return invalidBody('courseId, a rating from 1 to 5 and a review are required');
  const result = await createReviewService(auth.session, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ review: result.review, course: result.course }, { status: 201 });
}
