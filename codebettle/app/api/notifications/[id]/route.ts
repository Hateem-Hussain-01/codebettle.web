import { NextResponse } from 'next/server';
import { assertNotViewAs, requireSession } from '@/lib/api-helpers';
import { deleteNotification } from '@/lib/db/notifications';

/**
 * DELETE /api/notifications/[id] — delete one of the signed-in user's
 * own notifications. An id belonging to another user (or that does not
 * exist) returns 404, never a leak.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  // View-as is view-only: a viewing admin must not delete the viewed
  // person's notifications as them.
  const viewOnly = assertNotViewAs(auth.session);
  if (viewOnly) return viewOnly;
  const { id } = await params;
  const deleted = await deleteNotification(auth.session.id, id);
  if (!deleted) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
