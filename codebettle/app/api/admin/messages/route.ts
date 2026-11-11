import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { listContactMessages } from '@/lib/db/contact-messages';

/**
 * GET /api/admin/messages — paginated contact-form inbox (admin only).
 * Query params: page, limit, unreadOnly=true.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminArea('messages');
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const page = await listContactMessages({
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
    unreadOnly: params.get('unreadOnly') === 'true',
  });
  return NextResponse.json({
    messages: page.items,
    page: page.page,
    totalPages: page.totalPages,
    total: page.total,
  });
}
