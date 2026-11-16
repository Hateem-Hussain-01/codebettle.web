import { connection } from 'next/server';
import { listTeamAnnouncements } from '@/lib/db/team';
import { formatDateShort } from '@/lib/utils';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';

/**
 * Team Announcements — newest first (Eman, 16 Nov 2026). Read-only
 * for members; only admins post (admin Team section).
 */
export default async function TeamAnnouncementsPage() {
  await connection();
  const announcements = await listTeamAnnouncements();
  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Announcements</h1>
        <p className="text-muted mt-1">News from the admin, newest first.</p>
      </FadeIn>
      {announcements.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted">No announcements yet.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => (
            <Card key={a.id} className="p-6">
              <h2 className="text-lg font-bold text-foreground">{a.title}</h2>
              <p className="text-xs text-muted mt-1">{formatDateShort(a.createdAt)}</p>
              <p className="text-sm text-foreground/90 mt-3 whitespace-pre-wrap leading-relaxed">{a.body}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
