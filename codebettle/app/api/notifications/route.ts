import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-helpers';
import { getUnreadCount, listNotificationsForUser } from '@/lib/db/notifications';

/**
 * GET /api/notifications — the signed-in user's own notifications,
 * newest first, paginated. Query params: page, limit, type, category,
 * pending.
 *
 * - ?type=<type> filters by notification type (e.g. 'announcement').
 * - ?category=<category> filters by category (general | important |
 *   warning | special_notice).
 * - ?pending=true returns ONLY notifications with
 *   requiresAcknowledge=true that have NOT been acknowledged yet,
 *   oldest first (the login acknowledge popup). Read state does NOT
 *   discharge them — a read-but-unacknowledged item stays pending
 *   until acknowledgedAt is set. unreadCount is unaffected — it
 *   still counts all unread.
 * Session auth required; userId always comes from the session, never
 * from the request.
 */
export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const page = await listNotificationsForUser(auth.session.id, {
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
    type: params.get('type') ?? undefined,
    category: params.get('category') ?? undefined,
    pending: params.get('pending') === 'true',
  });
  const unreadCount = await getUnreadCount(auth.session.id);
  return NextResponse.json({
    notifications: page.items,
    unreadCount,
    page: page.page,
    limit: page.limit,
    total: page.total,
    totalPages: page.totalPages,
    hasNext: page.hasNext,
    hasPrev: page.hasPrev,
  });
}
