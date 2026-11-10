import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-helpers';
import { markNotificationRead } from '@/lib/db/notifications';

/**
 * POST /api/notifications/[id]/read — mark one of the signed-in user's
 * own notifications read. An id belonging to another user (or that does
 * not exist) returns 404, never a leak. Already-read is idempotent (200).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const notification = await markNotificationRead(auth.session.id, id);
  if (!notification) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  }
  return NextResponse.json({ notification });
}
