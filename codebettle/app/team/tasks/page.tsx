import { connection } from 'next/server';
import { getSession } from '@/lib/auth';
import { listTeamTasks } from '@/lib/db/team';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import TeamTasksClient from './tasks-client';

/**
 * Team Tasks — every team task, newest first (Eman, 16 Nov 2026).
 * Members see all team tasks, not just their own; the assignee moves
 * their own task one step forward (todo -> doing -> done) from here.
 * Only admins create tasks (admin Team section).
 */
export default async function TeamTasksPage() {
  await connection();
  const session = await getSession();
  const tasks = await listTeamTasks();
  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Tasks</h1>
        <p className="text-muted mt-1">All team tasks. Move your own tasks forward — To do → Doing → Done.</p>
      </FadeIn>
      <Card className="p-6">
        <TeamTasksClient tasks={tasks} myEmail={session!.email} />
      </Card>
    </div>
  );
}
