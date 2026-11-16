import { connection } from 'next/server';
import {
  isTeamTableReady,
  listTeamAccess,
  listTeamAnnouncements,
  listTeamFiles,
  listTeamMeetings,
  listTeamTasks,
  TEAM_TABLE_MISSING_MESSAGE,
} from '@/lib/db/team';
import { getUsersByIds } from '@/lib/db/users';
import Card from '@/components/ui/Card';
import TeamAdminClient from './team-client';

/**
 * Admin Team — the Team Portal's admin surface (Eman, 16 Nov 2026).
 *
 * ONE page (admin `team` area): team access grants by email (+ the
 * linked account state), task create/edit/assign, announcement posts,
 * meeting scheduling, file upload. Admins manage everything here —
 * they do NOT need the team portal itself.
 *
 * Fail-safe: until Eman runs codebettle-team-portal-migration.sql the
 * page shows a "run the SQL" card instead of a 500.
 */
export default async function AdminTeamPage() {
  await connection();
  const ready = await isTeamTableReady();
  if (!ready) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-black text-foreground">Team</h1>
        <Card className="p-6">
          <h2 className="text-lg font-bold text-foreground">Team portal is not set up yet</h2>
          <p className="text-sm text-muted mt-2 leading-relaxed">{TEAM_TABLE_MISSING_MESSAGE}</p>
          <p className="text-sm text-muted mt-2 leading-relaxed">
            Run <code className="text-primary-text">codebettle-team-portal-migration.sql</code> in the Supabase SQL Editor,
            then create a private <code className="text-primary-text">team-files</code> bucket in Storage for file uploads.
          </p>
        </Card>
      </div>
    );
  }

  const [grants, tasks, announcements, meetings, files] = await Promise.all([
    listTeamAccess(),
    listTeamTasks(),
    listTeamAnnouncements(),
    listTeamMeetings(),
    listTeamFiles(),
  ]);
  const linkedUserIds = grants.map((g) => g.userId).filter((id): id is string => Boolean(id));
  const usersById = await getUsersByIds(linkedUserIds);
  const memberNames: Record<string, string> = {};
  for (const grant of grants) {
    if (grant.userId) {
      const name = usersById.get(grant.userId)?.name;
      if (name) memberNames[grant.email] = name;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground">Team</h1>
        <p className="text-muted mt-1">
          Team portal access, tasks, announcements, meetings and files. Credits live in their own section
          (Credits Management) — not here.
        </p>
      </div>
      <TeamAdminClient
        grants={grants}
        memberNames={memberNames}
        tasks={tasks}
        announcements={announcements}
        meetings={meetings}
        files={files}
      />
    </div>
  );
}
