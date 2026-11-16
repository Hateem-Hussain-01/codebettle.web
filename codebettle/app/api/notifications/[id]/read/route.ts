import { NextResponse } from 'next/server';
import { assertNotViewAs, requireSession } from '@/lib/api-helpers';
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
  // View-as is view-only: the notification popups mounted in every
  // portal shell mark rows read on dismiss — a viewing admin must
  // not mark the viewed person's notifications read as them.
  const viewOnly = assertNotViewAs(auth.session);
  if (viewOnly) return viewOnly;
  const { id } = await params;
  const notification = await markNotificationRead(auth.session.id, id);
  if (!notification) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  }
  return NextResponse.json({ notification });
}
