import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, requireTeamMember } from '@/lib/api-helpers';
import { hasAdminCapability } from '@/lib/rbac';
import {
  deleteTeamFile,
  getTeamFileById,
  isMissingTeamTableError,
  TEAM_TABLE_MISSING_MESSAGE,
} from '@/lib/db/team';
import { createTeamFileSignedUrl, deleteTeamFileFromStorage } from '@/lib/services/team-file-storage';

/**
 * GET /api/team/files/[id] — mint a short-lived signed URL (1 hour)
 * for a shared team file, so a team member can download it from the
 * PRIVATE `team-files` bucket. Team members only.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamMember();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  try {
    const file = await getTeamFileById(id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const url = await createTeamFileSignedUrl(file.storagePath);
    return NextResponse.json({ url });
  } catch (e) {
    if (isMissingTeamTableError(e)) {
      return NextResponse.json({ error: TEAM_TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    const message = e instanceof Error ? e.message : '';
    if (message.includes('SUPABASE_SERVICE_ROLE_KEY') || message.includes('Supabase URL is not set')) {
      return NextResponse.json(
        { error: 'File access is not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Could not open the file' }, { status: 500 });
  }
}

/**
 * DELETE /api/team/files/[id] — remove a shared team file (row +
 * storage object). The uploader or an admin. Best-effort on the
 * storage object: the row is gone even if the object delete fails.
 * View-as sessions are view-only (403). The GET (signed-URL
 * download) above stays open to view-as — reading is not a mutation.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamMember();
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;
  try {
    const file = await getTeamFileById(id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    if (file.uploadedBy !== auth.session.id && !hasAdminCapability(auth.session)) {
      return NextResponse.json({ error: 'Only the uploader or an admin can delete this file' }, { status: 403 });
    }
    await deleteTeamFile(id);
    try {
      await deleteTeamFileFromStorage(file.storagePath);
    } catch (e) {
      console.error('Failed to delete team file from storage', e);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    if (isMissingTeamTableError(e)) {
      return NextResponse.json({ error: TEAM_TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not delete the file' }, { status: 500 });
  }
}
