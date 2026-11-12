import { Bell } from 'lucide-react';
import Card from '@/components/ui/Card';
import { formatDateShort } from '@/lib/utils';
import type { Announcement } from '@/lib/db/types';

interface TeacherAnnouncementsPanelProps {
  announcements: Announcement[];
  /** authorId -> display name, resolved server-side (falls back to "Your teacher"). */
  authorNames?: Record<string, string>;
}

/**
 * "Notification from Your Teacher" panel on the student course page
 * (Phase 3, Worker C). Lists the course's announcements — title,
 * content, author name, date. The Announcement model has no category
 * field (only type 'site-wide' | 'course'), so no category badge is
 * rendered; the panel shows what the model actually carries.
 * Only enrolled students ever see this page (the page itself 404s for
 * anyone not enrolled), so no extra check is added here.
 */
export default function TeacherAnnouncementsPanel({ announcements, authorNames = {} }: TeacherAnnouncementsPanelProps) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Bell className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-white text-sm">Notification from Your Teacher</h3>
      </div>
      {announcements.length === 0 ? (
        <p className="text-muted text-xs">No announcements from your teacher yet.</p>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => (
            <div key={ann.id} className="border-l-2 border-primary/40 pl-3">
              <p className="text-white text-xs font-medium">{ann.title}</p>
              <p className="text-muted text-xs mt-0.5 whitespace-pre-line">{ann.content}</p>
              <p className="text-muted text-xs mt-1">
                {authorNames[ann.authorId] ?? 'Your teacher'} · {formatDateShort(ann.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
