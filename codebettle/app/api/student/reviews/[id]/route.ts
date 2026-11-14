import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNotViewAs, invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { deleteReviewService, updateReviewService } from '@/lib/services/review-service';

/**
 * PATCH /api/student/reviews/[id] — edit your own review (student only).
 * Body: any subset of { rating: 1-5, title?, comment }. An edited review
 * goes back to `pending` — it is hidden publicly until an admin approves
 * it again. The course rating + reviewCount are recomputed from the
 * APPROVED reviews only.
 */
const patchSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(200).nullable().optional(),
  comment: z.string().min(1).max(2000).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;
  const body = await readJson(request);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return invalidBody('A rating from 1 to 5, a title or a review is required');
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const result = await updateReviewService(auth.session, id, {
    ...(parsed.data.rating !== undefined ? { rating: parsed.data.rating } : {}),
    ...(parsed.data.title !== undefined ? { title: parsed.data.title ?? '' } : {}),
    ...(parsed.data.comment !== undefined ? { comment: parsed.data.comment } : {}),
  });
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ review: result.review, course: result.course });
}

/**
 * DELETE /api/student/reviews/[id] — delete your own review (student
 * only). The course rating + reviewCount are recomputed afterwards.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;
  const result = await deleteReviewService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true, course: result.course });
}
