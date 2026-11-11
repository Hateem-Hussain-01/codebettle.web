import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { applicationNoteSchema } from '@/lib/api-schemas';
import { addApplicationNoteService, listApplicationNotesService } from '@/lib/services/recruitment-service';

/**
 * GET /api/admin/applications/[id]/notes — internal admin notes for
 * an application, newest first.
 * POST — add an internal note. Notes are ALWAYS internal
 * (isInternal=true): there is no applicant read path for notes at
 * all, so nothing written here can ever leak to an applicant.
 * Admin only (applications area).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('applications');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await listApplicationNotesService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('applications');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = applicationNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Note text is required' }, { status: 400 });
  }
  const result = await addApplicationNoteService(auth.session, id, parsed.data.body);
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result, { status: 201 });
}
