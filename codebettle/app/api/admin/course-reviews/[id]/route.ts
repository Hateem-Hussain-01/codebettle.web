import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea, requireFullAdmin, serviceError } from '@/lib/api-helpers';
import { getReviewById } from '@/lib/db/reviews';
import type { ReviewStatus } from '@/lib/db/types';
import { adminDeleteReviewService, adminUpdateReviewService } from '@/lib/services/review-service';

/**
 * PATCH /api/admin/course-reviews/[id] — moderate a review: approve /
 * reject (status), or edit it before publishing (rating, title, comment).
 * Guard: requireAdminArea('course-reviews').
 *
 * DELETE — remove a review (real DB delete). Guard: requireFullAdmin
 * (destructive, same as the home Reviews admin area).
 */
const patchSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(200).nullable().optional(),
  comment: z.string().min(1).max(2000).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('course-reviews');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return invalidBody('A valid status, rating, title or review text is required');
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const current = await getReviewById(id);
  if (!current) return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  const result = await adminUpdateReviewService(auth.session, id, {
    ...(parsed.data.status ? { status: parsed.data.status as ReviewStatus } : {}),
    ...(parsed.data.rating !== undefined ? { rating: parsed.data.rating } : {}),
    ...(parsed.data.title !== undefined ? { title: parsed.data.title ?? '' } : {}),
    ...(parsed.data.comment !== undefined ? { comment: parsed.data.comment } : {}),
  });
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ review: result.review, course: result.course });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireFullAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const current = await getReviewById(id);
  if (!current) return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  const result = await adminDeleteReviewService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true, course: result.course });
}
