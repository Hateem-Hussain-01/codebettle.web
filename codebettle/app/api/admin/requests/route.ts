import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { listSupportRequestsForAdmin } from '@/lib/db/support-requests';

/**
 * GET /api/admin/requests — admin support-request inbox (Phase 3).
 * Query params: page, limit, status, category.
 *
 * Guard: requireAdminArea('messages') — there is no 'requests' area
 * in ADMIN_AREAS; the requests inbox is the inbound-message queue,
 * same as contact messages ('messages' area), so restricted admins
 * need that area granted. Full admins pass. (Flagged in the Phase 3
 * report: if a dedicated 'requests' area is ever added, switch this
 * guard and the [id] routes to it.)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminArea('messages');
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
