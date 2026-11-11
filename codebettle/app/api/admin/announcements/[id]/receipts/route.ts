import { NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { getAnnouncementById } from '@/lib/db/announcements';
import { listNotificationsByAnnouncement } from '@/lib/db/notifications';
import { getAllUsers } from '@/lib/db/users';

/**
 * GET /api/admin/announcements/[id]/receipts — read/acknowledge
 * receipts for one announcement (Phase 3, admin only).
 *
 * Guard: requireAdminArea('announcements') — receipts belong to the
 * announcements area. Aggregates over the Notification rows fanned
 * out from this announcement (announcementId = id): total recipients,
 * how many read, how many acknowledged, and the per-recipient rows.
 * A missing announcement is 404. Users who were deleted after the
 * fan-out have no current record — their rows are listed with the
 * stored userId and null name/email rather than dropped, so the
 * totals always reconcile with the recipient list.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('announcements');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const announcement = await getAnnouncementById(id);
  if (!announcement) {
    return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
  }
  const rows = await listNotificationsByAnnouncement(id);
  const users = await getAllUsers();
  const byId = new Map(users.map((u) => [u.id, u]));
  const recipients = rows.map((n) => {
    const user = byId.get(n.userId);
    return {
      userId: n.userId,
      name: user?.name ?? null,
      email: user?.email ?? null,
      readAt: n.readAt ?? null,
      acknowledgedAt: n.acknowledgedAt ?? null,
    };
  });
  return NextResponse.json({
    announcement: { id: announcement.id, title: announcement.title, createdAt: announcement.createdAt },
    total: rows.length,
    read: rows.filter((n) => n.readAt).length,
    acknowledged: rows.filter((n) => n.acknowledgedAt).length,
    recipients,
  });
}
