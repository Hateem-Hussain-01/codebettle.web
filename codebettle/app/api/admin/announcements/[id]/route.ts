import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/api-helpers';
import { deleteAnnouncement } from '@/lib/db/announcements';

/** DELETE /api/admin/announcements/[id] — delete any announcement (admin only). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['admin']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const removed = await deleteAnnouncement(id);
  if (!removed) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
