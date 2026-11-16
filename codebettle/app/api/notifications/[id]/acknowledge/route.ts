import { NextResponse } from 'next/server';
import { assertNotViewAs, requireSession } from '@/lib/api-helpers';
import { acknowledgeNotification } from '@/lib/db/notifications';

/**
 * POST /api/notifications/[id]/acknowledge — acknowledge one of the
 * signed-in user's own notifications (Phase 3). Sets acknowledgedAt
 * (and readAt when still null). Idempotent: acknowledging again
 * returns the same row with the original acknowledgedAt. An id
 * belonging to another user (or that does not exist) returns 404,
 * never a leak.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  // View-as is view-only: the notification popups mounted in every
  // portal shell acknowledge rows on dismiss — a viewing admin must
  // not acknowledge the viewed person's notifications as them.
  const viewOnly = assertNotViewAs(auth.session);
  if (viewOnly) return viewOnly;
  const { id } = await params;
  const notification = await acknowledgeNotification(auth.session.id, id);
  if (!notification) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  }
  return NextResponse.json({ notification });
}
