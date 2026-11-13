import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { uploadCeoPhotoImage } from '@/lib/services/course-image-storage';

/**
 * POST /api/admin/settings/ceo-photo — upload a new CEO photo for the
 * Success Stories page (admin only, `settings` area). Used by the
 * "Update Image" button in Admin > Settings > Success Stories:
 * multipart/form-data with a single `photo` field. JPG/PNG/WebP only,
 * 5 MB max (validated server-side, before the storage client is
 * built). The image goes to the public `course-images` bucket
 * (`team/ceo/<uuid>.<ext>`) and the returned public URL is then saved
 * as the `ceoPhotoUrl` setting (PATCH /api/admin/settings) — the
 * public page reads it from settings, so no code deploy is needed.
 * Returns { url, path }.
 *
 * Same 503 contract as the thumbnail upload: missing service-role key
 * or missing `course-images` bucket is a plain-message 503, never a
 * stack trace, never the key.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('settings');
  if ('error' in auth) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const file = form.get('photo');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'An image file is required' }, { status: 400 });
  }
  try {
    const { url, path } = await uploadCeoPhotoImage({
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
        { error: 'CEO photo uploads are not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    if (message.includes('Bucket not found')) {
      return NextResponse.json(
        { error: 'CEO photo uploads are not set up yet (the course-images bucket does not exist in Supabase Storage)' },
        { status: 503 },
      );
    }
    if (
      message.includes('Only JPG, PNG or WebP') ||
      message.includes('5 MB or smaller')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'CEO photo upload failed' }, { status: 500 });
  }
}
