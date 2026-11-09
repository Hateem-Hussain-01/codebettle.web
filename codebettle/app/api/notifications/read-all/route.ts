import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-helpers';
import { markAllRead } from '@/lib/db/notifications';

/**
 * POST /api/notifications/read-all — mark all of the signed-in user's
 * unread notifications read. Only the caller's rows are touched.
 */
export async function POST() {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const marked = await markAllRead(auth.session.id);
  return NextResponse.json({ marked });
}
