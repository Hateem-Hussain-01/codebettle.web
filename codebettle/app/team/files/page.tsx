import { connection } from 'next/server';
import { getSession } from '@/lib/auth';
import { listTeamFiles } from '@/lib/db/team';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import TeamFilesClient from './files-client';

/**
 * Team Files — shared files, newest first (Eman, 16 Nov 2026).
 * Admins and team members can upload; team members and admins can
 * download (signed URL, 1 hour). Files live in the private
 * `team-files` bucket — never a public URL.
 */
export default async function TeamFilesPage() {
  await connection();
  const session = await getSession();
  const files = await listTeamFiles();
  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Files</h1>
        <p className="text-muted mt-1">Files shared with the team. Upload your own, download any of them.</p>
      </FadeIn>
      <Card className="p-6">
        <TeamFilesClient files={files} myId={session!.id} />
      </Card>
    </div>
  );
}
