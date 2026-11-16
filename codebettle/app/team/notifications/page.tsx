import Link from 'next/link';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';

/**
 * Team Notifications — a placeholder page for the portal bell (Eman,
 * 16 Nov 2026). The team portal has no separate notification feed in
 * v1: announcements and meetings are the team's notices, so this page
 * points at them instead of 404ing the bell. A real feed can replace
 * this page later without touching the layout.
 */
export default function TeamNotificationsPage() {
  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Notifications</h1>
        <p className="text-muted mt-1">Team notices live under Announcements and Meetings.</p>
      </FadeIn>
      <Card className="p-6">
        <p className="text-sm text-muted">No separate notification feed yet. Check the latest:</p>
        <div className="mt-4 flex gap-3">
          <Link href="/team/announcements" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-ink">
            Announcements
          </Link>
          <Link
            href="/team/meetings"
            className="rounded-lg border border-dark-border px-4 py-2 text-sm font-medium text-foreground hover:border-primary/40"
          >
            Meetings
          </Link>
        </div>
      </Card>
    </div>
  );
}
