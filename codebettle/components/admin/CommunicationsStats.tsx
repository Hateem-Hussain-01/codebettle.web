import { Bell, GraduationCap, Megaphone, Send, BookOpen, CheckCheck } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import { readRate, type CommunicationsStats } from '@/app/admin/communications/communications-helpers';

/**
 * Communications dashboard stat cards (Phase 3, Module 14).
 *
 * Every number is computed server-side from real rows (announcements,
 * users, enrolments, targeted Notification rows) — nothing here is
 * invented. `openRequests` is null until the requests summary loads in
 * the client; the card then shows "—" rather than a made-up zero.
 */
export default function CommunicationsStats({
  stats,
  openRequests,
}: {
  stats: CommunicationsStats;
  openRequests?: number | null;
}) {
  const rate = readRate(stats.targetedRead, stats.targetedSent);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <StatCard title="Announcements" value={stats.totalAnnouncements} icon={<Megaphone className="w-5 h-5" />} />
      <StatCard title="Site-wide" value={stats.siteWideAnnouncements} icon={<Bell className="w-5 h-5" />} color="blue" />
      <StatCard title="Course" value={stats.courseAnnouncements} icon={<BookOpen className="w-5 h-5" />} color="blue" />
      <StatCard
        title="Teacher-authored"
        value={stats.teacherAuthoredAnnouncements}
        icon={<GraduationCap className="w-5 h-5" />}
        color="purple"
      />
      <StatCard
        title="Targeted sent"
        value={stats.targetedSent}
        subtitle={rate === null ? 'No targeted sends yet' : `${stats.targetedRead} read (${rate}%)`}
        icon={<Send className="w-5 h-5" />}
        color="green"
      />
      <StatCard
        title="Open requests"
        value={openRequests ?? '—'}
        subtitle={openRequests === null || openRequests === undefined ? 'Request queue not loaded' : undefined}
        icon={<CheckCheck className="w-5 h-5" />}
        color="red"
      />
    </div>
  );
}
