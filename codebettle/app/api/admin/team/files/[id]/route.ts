import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { deleteTeamFile, getTeamFileById, isMissingTeamTableError, TEAM_TABLE_MISSING_MESSAGE } from '@/lib/db/team';
import { deleteTeamFileFromStorage } from '@/lib/services/team-file-storage';

/**
 * DELETE /api/admin/team/files/[id] — remove a shared team file (row +
 * storage object), admin `team` area. Best-effort on the storage
 * object: the row is gone even if the object delete fails.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('team');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  try {
    const file = await getTeamFileById(id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
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
