import { NextResponse } from 'next/server';
import { assertNotViewAs, requireSession } from '@/lib/api-helpers';
import { markAllRead } from '@/lib/db/notifications';

/**
 * POST /api/notifications/read-all — mark all of the signed-in user's
 * unread notifications read. Only the caller's rows are touched.
 */
export async function POST() {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  // View-as is view-only: the notification popups mounted in every
  // portal shell (LoginNotificationPopup, TeacherMessagePopup) would
  // otherwise let a viewing admin mark the viewed person's
  // notifications read as them.
  const viewOnly = assertNotViewAs(auth.session);
  if (viewOnly) return viewOnly;
  const marked = await markAllRead(auth.session.id);
  return NextResponse.json({ marked });
}
