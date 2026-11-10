import { NextRequest, NextResponse } from 'next/server';
import { requireRoles, serviceError } from '@/lib/api-helpers';
import { deleteReviewService } from '@/lib/services/review-service';

/**
 * DELETE /api/student/reviews/[id] — delete your own review (student
 * only). The course rating + reviewCount are recomputed afterwards.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await deleteReviewService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true, course: result.course });
}
