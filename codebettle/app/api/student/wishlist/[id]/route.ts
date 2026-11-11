import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, requireRoles } from '@/lib/api-helpers';
import { listWishlistForUser, removeFromWishlist } from '@/lib/db/wishlist';

/**
 * DELETE /api/student/wishlist/[id] — remove one of your own wishlist
 * entries. `[id]` is the wishlist entry id; a course id is also
 * accepted (what the heart toggle on course cards knows). Scoped by
 * session id: another student's entry reads as not found (404).
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;
  const items = await listWishlistForUser(auth.session.id);
  const entry = items.find((w) => w.id === id);
  const courseId = entry ? entry.courseId : id;
  const removed = await removeFromWishlist(auth.session.id, courseId);
  if (!removed) return NextResponse.json({ error: 'Wishlist entry not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
