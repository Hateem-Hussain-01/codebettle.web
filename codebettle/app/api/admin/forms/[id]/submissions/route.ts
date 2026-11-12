import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea, serviceError } from '@/lib/api-helpers';
import { listFormSubmissionsService } from '@/lib/services/form-service';

/**
 * GET /api/admin/forms/[id]/submissions — a form's submissions
 * (Phase 6). Query params: page, limit, status=reviewed|unreviewed.
 *
 * Guard: requireAdminArea('forms').
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('forms');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const search = request.nextUrl.searchParams;
  const status = search.get('status');
  if (status !== null && status !== 'reviewed' && status !== 'unreviewed') {
    return NextResponse.json(
      { error: 'status must be reviewed or unreviewed' },
      { status: 400 },
    );
  }
  const result = await listFormSubmissionsService(auth.session, id, {
    page: search.get('page') ?? undefined,
    limit: search.get('limit') ?? undefined,
    reviewed: status === null ? undefined : status === 'reviewed',
  });
  if ('error' in result) return serviceError(result);
  return NextResponse.json({
    submissions: result.items,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
    hasNext: result.hasNext,
    hasPrev: result.hasPrev,
  });
}
