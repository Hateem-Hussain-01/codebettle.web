import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { createTeamFile, isMissingTeamTableError, TEAM_TABLE_MISSING_MESSAGE } from '@/lib/db/team';
import { uploadTeamFile } from '@/lib/services/team-file-storage';
import { isUploadValidationError } from '@/lib/services/file-validation';

/**
 * POST /api/admin/team/files — upload a shared team file as an admin
 * (admin `team` area). Admins upload here, not through the team
 * portal route — team access is a separate grant and an admin does
 * not hold it by virtue of being an admin.
 * multipart/form-data with a single `file` field. Same type/size
 * rules as the team upload route. 503 with a plain message when the
 * Supabase key or the `team-files` bucket is not set up yet.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('team');
  if ('error' in auth) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'A file is required' }, { status: 400 });
  }
  try {
    const { path } = await uploadTeamFile({
      name: file.name,
      type: file.type,
      size: file.size,
      arrayBuffer: await file.arrayBuffer(),
    });
    const record = await createTeamFile({
      fileName: file.name,
      storagePath: path,
      mime: file.type,
      size: file.size,
      uploadedBy: auth.session.id,
    });
    return NextResponse.json({ file: record }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (isMissingTeamTableError(e)) {
      return NextResponse.json({ error: TEAM_TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    if (message.includes('SUPABASE_SERVICE_ROLE_KEY') || message.includes('Supabase URL is not set')) {
      return NextResponse.json(
        { error: 'Team file uploads are not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    if (message.includes('Bucket not found') || message.includes('bucket')) {
      return NextResponse.json(
        { error: 'The team-files storage bucket is not set up yet — create a private `team-files` bucket in Supabase Storage first' },
        { status: 503 },
      );
    }
    if (isUploadValidationError(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Team file upload failed' }, { status: 500 });
  }
}
