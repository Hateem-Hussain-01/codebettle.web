import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea, serviceError } from '@/lib/api-helpers';
import { getFormDefinitionById } from '@/lib/db/forms';
import { updateFormService } from '@/lib/services/form-service';
import {
  deleteFormCoverImage,
  formCoverImagePathFromUrl,
  uploadFormCoverImage,
} from '@/lib/services/course-image-storage';

/**
 * POST /api/admin/forms/[id]/cover — upload a form's cover image (admin only).
 * multipart/form-data with a single `cover` field. JPG/PNG/WebP/GIF,
 * 5 MB max. The image goes to the EXISTING public `course-images`
 * bucket (prefix `forms/<formId>/`) in Supabase Storage — no new
 * bucket: a cover is public by nature, like a course thumbnail.
 * Returns { url, path } and writes NOTHING to the database: the
 * builder stores the URL in `schema.coverImageUrl` when the admin
 * saves the form, so an upload that is never saved leaves an orphaned
 * (unreferenced) file instead of a half-saved form.
 *
 * DELETE /api/admin/forms/[id]/cover — remove the form's cover (admin
 * only). Deletes the stored file when it lives in `course-images`
 * (best-effort, never blocks the removal) and clears
 * `schema.coverImageUrl` from the stored schema immediately.
 *
 * When the Supabase service-role key is not configured, this returns
 * 503 with a plain message — never a stack trace, never the key. When
 * the `course-images` bucket does not exist yet in Supabase Storage,
 * this returns 503 naming the bucket (it already exists for course
 * thumbnails: Storage -> `course-images`, Public).
 *
 * Guard: requireAdminArea('forms').
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('forms');
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const existing = await getFormDefinitionById(id);
  if (!existing) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const file = form.get('cover');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'An image file is required' }, { status: 400 });
  }

  try {
    const { url, path } = await uploadFormCoverImage(id, {
      name: file.name,
      type: file.type,
      size: file.size,
      arrayBuffer: await file.arrayBuffer(),
    });
    return NextResponse.json({ url, path });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (
      message.includes('SUPABASE_SERVICE_ROLE_KEY') ||
      message.includes('Supabase URL is not set')
    ) {
      return NextResponse.json(
        { error: 'Cover uploads are not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    if (message.includes('Bucket not found')) {
      return NextResponse.json(
        { error: 'Cover uploads are not set up yet (the course-images bucket does not exist in Supabase Storage)' },
        { status: 503 },
      );
    }
    if (
      message.includes('Only JPG, PNG, WebP or GIF') ||
      message.includes('5 MB or smaller')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Cover upload failed' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('forms');
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const existing = await getFormDefinitionById(id);
  if (!existing) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  const oldUrl = existing.schema.coverImageUrl;
  const oldPath = oldUrl ? formCoverImagePathFromUrl(oldUrl) : null;
  if (oldPath) {
    try {
      await deleteFormCoverImage(oldPath);
    } catch (e) {
      console.error('Could not delete old form cover', oldPath, e);
    }
  }
  const { coverImageUrl: _removed, ...rest } = existing.schema;
  const result = await updateFormService(auth.session, id, { schema: { ...rest } });
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ form: result.form });
}
