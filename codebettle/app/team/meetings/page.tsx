import { connection } from 'next/server';
import { listUpcomingTeamMeetings } from '@/lib/db/team';
import { formatDateTime } from '@/lib/utils';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';

/**
 * Team Meetings — upcoming, soonest first (Eman, 16 Nov 2026).
 * Read-only for members; only admins schedule (admin Team section).
 */
export default async function TeamMeetingsPage() {
  await connection();
  const meetings = await listUpcomingTeamMeetings();
  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Meetings</h1>
        <p className="text-muted mt-1">Upcoming team meetings, soonest first.</p>
      </FadeIn>
      {meetings.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted">No meetings scheduled.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {meetings.map((m) => (
            <Card key={m.id} className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-foreground">{m.title}</h2>
                  <p className="text-sm text-muted mt-1">{formatDateTime(m.startsAt)}</p>
                  {m.agenda && <p className="text-sm text-foreground/90 mt-3 whitespace-pre-wrap leading-relaxed">{m.agenda}</p>}
                </div>
                {m.meetingLink && (
                  <a
                    href={m.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-ink"
                  >
                    Join meeting
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
