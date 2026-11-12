import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { listSupportRequestsForAdmin } from '@/lib/db/support-requests';

/**
 * GET /api/admin/requests — admin support-request inbox (Phase 3).
 * Query params: page, limit, status, category.
 *
 * Guard: requireAdminArea('requests') — the dedicated 'requests' area
 * in ADMIN_AREAS (added in Phase 3); restricted admins need that area
 * granted. Full admins pass.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminArea('requests');
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const status = params.get('status') ?? undefined;
  const category = params.get('category') ?? undefined;
  const page = await listSupportRequestsForAdmin({
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
    status,
    category,
  });
  return NextResponse.json({
    requests: page.items,
    page: page.page,
    limit: page.limit,
    total: page.total,
    totalPages: page.totalPages,
    hasNext: page.hasNext,
    hasPrev: page.hasPrev,
  });
}
