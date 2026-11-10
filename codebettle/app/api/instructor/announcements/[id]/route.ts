import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/api-helpers';
import { deleteAnnouncement, getAnnouncementById } from '@/lib/db/announcements';

/**
 * DELETE /api/instructor/announcements/[id] — delete your own
 * announcement (instructor only; the author must match).
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['instructor']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const existing = await getAnnouncementById(id);
  if (!existing) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
  if (existing.authorId !== auth.session.id) {
    return NextResponse.json({ error: 'You can only delete your own announcements' }, { status: 403 });
  }
  await deleteAnnouncement(id);
  return NextResponse.json({ success: true });
}
