import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { isSubscriberTableReady, listSubscribers } from '@/lib/db/subscribers';

/**
 * GET /api/admin/subscribers — paginated newsletter subscribers (admin only).
 * Query params: page, limit.
 * Returns { subscribers, page, totalPages, total, tableMissing }.
 * tableMissing is true when the Subscriber SQL migration has not run
 * yet — the UI shows a "run the SQL" state instead of an error.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminArea('subscribers');
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const tableMissing = !(await isSubscriberTableReady());
  const page = await listSubscribers({
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  return NextResponse.json({
    subscribers: page.items,
    page: page.page,
    totalPages: page.totalPages,
    total: page.total,
    tableMissing,
  });
}
