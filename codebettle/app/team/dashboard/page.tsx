import { connection } from 'next/server';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import {
  listTeamAnnouncements,
  listTeamFiles,
  listTeamTasksForAssignee,
  listUpcomingTeamMeetings,
} from '@/lib/db/team';
import { getTeamAccessByEmail, getTeamAccessByUserId } from '@/lib/db/team';
import {
  getTeamCreditSummary,
  getTeamReferralCodeByTeamAccessId,
  isTeamCreditTableReady,
} from '@/lib/db/team-credits';
import { getTeamCreditSettings } from '@/lib/services/settings-service';
import { formatDateShort, formatDateTime } from '@/lib/utils';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { ClipboardList, Megaphone, CalendarCheck, FolderOpen, ArrowRight, Coins } from 'lucide-react';

/**
 * Team Portal home — welcome + counts (Eman, 16 Nov 2026).
 *
 * Counts are honest v1 numbers: open tasks (todo + doing) assigned to
 * the member, announcements posted, upcoming meetings, files shared.
 * There is no read-tracking in v1, so the announcements count is the
 * total posted, not an "unread" count — the label says so.
 *
 * CREDITS STRIP (PR B): the member's balance + referral code sit in a
 * full-width strip below the stat cards (the 4-card grid stays
 * symmetrical). The code is NOT minted here — it is minted on the
 * Credits page (or by the admin backfill); the strip just shows it
 * when one exists. All numbers read the live admin settings.
 */
export default async function TeamDashboard() {
  await connection();
  const session = await getSession();
  const [myTasks, announcements, meetings, files] = await Promise.all([
    listTeamTasksForAssignee(session!.email),
    listTeamAnnouncements(),
    listUpcomingTeamMeetings(),
    listTeamFiles(),
  ]);
  const openTasks = myTasks.filter((t) => t.status !== 'done');

  // Credits strip (PR B): balance + referral code. Until the credits
  // SQL runs, a slim "not set up yet" strip shows instead.
  const access =
    (await getTeamAccessByUserId(session!.id)) ?? (await getTeamAccessByEmail(session!.email));
  const creditsReady = await isTeamCreditTableReady();
  const credits =
    access && creditsReady
      ? {
          summary: await getTeamCreditSummary(access.id),
          code: (await getTeamReferralCodeByTeamAccessId(access.id))?.code ?? null,
          settings: await getTeamCreditSettings(),
        }
      : null;

  const stats = [
    { label: 'My open tasks', value: openTasks.length, href: '/team/tasks', icon: <ClipboardList className="w-5 h-5" /> },
    { label: 'Announcements', value: announcements.length, href: '/team/announcements', icon: <Megaphone className="w-5 h-5" /> },
    { label: 'Upcoming meetings', value: meetings.length, href: '/team/meetings', icon: <CalendarCheck className="w-5 h-5" /> },
    { label: 'Shared files', value: files.length, href: '/team/files', icon: <FolderOpen className="w-5 h-5" /> },
  ];

  return (
    <div className="space-y-8">
      <FadeIn className="bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-xl p-6">
        <h1 className="text-2xl font-black text-foreground mb-1">Welcome back, {session!.name.split(' ')[0]}! 👋</h1>
        <p className="text-muted">Everything the CodeBettle team needs — tasks, announcements, meetings and files — in one place.</p>
      </FadeIn>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="p-5 hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-primary-text">{s.icon}</span>
                <span className="text-3xl font-black text-foreground">{s.value}</span>
              </div>
              <p className="mt-3 text-sm font-medium text-muted">{s.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Credits strip (PR B) — balance + referral code, live settings. */}
      {access && !creditsReady ? (
        <Card className="p-5">
          <p className="text-sm text-muted">
            Credits are not set up yet — an admin needs to run the team credits SQL file first.
          </p>
        </Card>
      ) : credits ? (
        <Link href="/team/credits">
          <Card className="p-5 hover:border-primary/40 transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-primary-text"><Coins className="w-5 h-5" /></span>
                <div>
                  <p className="text-sm font-medium text-muted">My credits</p>
                  <p className="text-xl font-black text-foreground">
                    {credits.summary.balance} available
                    {credits.summary.held > 0 ? (
                      <span className="text-sm font-medium text-muted"> · {credits.summary.held} held</span>
                    ) : (
                      ''
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {credits.code ? (
                  <p className="text-sm text-muted">
                    Referral code{' '}
                    <span className="font-mono font-black tracking-widest text-primary-text">{credits.code}</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted">Your referral code is on the Credits page</p>
                )}
                <span className="text-sm font-medium text-primary-text flex items-center gap-1">
                  View credits <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          </Card>
        </Link>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My open tasks */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">My open tasks</h2>
            <Link href="/team/tasks" className="text-sm font-medium text-primary-text hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {openTasks.length === 0 ? (
            <p className="text-sm text-muted">No open tasks — you&apos;re all caught up. 🎉</p>
          ) : (
            <ul className="space-y-3">
              {openTasks.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 border-b border-dark-border pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                    {t.dueDate && <p className="text-xs text-muted">Due {formatDateShort(t.dueDate)}</p>}
                  </div>
                  <Badge variant={t.status === 'doing' ? 'primary' : 'muted'}>{t.status === 'doing' ? 'Doing' : 'To do'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Latest announcements */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">Latest announcements</h2>
            <Link href="/team/announcements" className="text-sm font-medium text-primary-text hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {announcements.length === 0 ? (
            <p className="text-sm text-muted">No announcements yet.</p>
          ) : (
            <ul className="space-y-3">
              {announcements.slice(0, 5).map((a) => (
                <li key={a.id} className="border-b border-dark-border pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-medium text-foreground">{a.title}</p>
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">{a.body}</p>
                  <p className="text-xs text-muted mt-1">{formatDateShort(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Upcoming meetings */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">Upcoming meetings</h2>
            <Link href="/team/meetings" className="text-sm font-medium text-primary-text hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {meetings.length === 0 ? (
            <p className="text-sm text-muted">No meetings scheduled.</p>
          ) : (
            <ul className="space-y-3">
              {meetings.slice(0, 5).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 border-b border-dark-border pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                    <p className="text-xs text-muted">{formatDateTime(m.startsAt)}</p>
                  </div>
                  {m.meetingLink && (
                    <a href={m.meetingLink} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-ink">
                      Join
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent files */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">Recent files</h2>
            <Link href="/team/files" className="text-sm font-medium text-primary-text hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {files.length === 0 ? (
            <p className="text-sm text-muted">No files shared yet.</p>
          ) : (
            <ul className="space-y-3">
              {files.slice(0, 5).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 border-b border-dark-border pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{f.fileName}</p>
                    <p className="text-xs text-muted">{formatDateShort(f.createdAt)}</p>
                  </div>
                  <span className="text-xs text-muted shrink-0">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
