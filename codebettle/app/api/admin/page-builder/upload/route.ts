import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { uploadPageImage } from '@/lib/services/course-image-storage';

/**
 * POST /api/admin/page-builder/upload — upload a block image for the
 * Page Builder (admin only, `page-builder` area). multipart/form-data
 * with `image` (file) + `pageId`. JPG/PNG/WebP/GIF only, 5 MB max
 * (validated server-side, before the storage client is built). The
 * image goes to the public `course-images` bucket
 * (`pages/<pageId>/<uuid>.<ext>`) and the returned public URL is saved
 * into the block content by the editor. Returns { url, path }.
 *
 * Same 503 contract as the other image uploads: missing service-role
 * key or missing `course-images` bucket is a plain-message 503, never
 * a stack trace, never the key.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('page-builder');
  if ('error' in auth) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const pageId = form.get('pageId');
  if (typeof pageId !== 'string' || !pageId.trim()) {
    return NextResponse.json({ error: 'pageId is required' }, { status: 400 });
  }
  const file = form.get('image');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'An image file is required' }, { status: 400 });
  }
  try {
    const { url, path } = await uploadPageImage(pageId.trim(), {
      name: file.name,
      type: file.type,
      size: file.size,
      arrayBuffer: await file.arrayBuffer(),
    });
    return NextResponse.json({ url, path });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message.includes('SUPABASE_SERVICE_ROLE_KEY') || message.includes('Supabase URL is not set')) {
      return NextResponse.json(
        { error: 'Page image uploads are not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    if (message.includes('Bucket not found')) {
      return NextResponse.json(
        { error: 'Page image uploads are not set up yet (the course-images bucket does not exist in Supabase Storage)' },
        { status: 503 },
      );
    }
    if (message.includes('Only JPG, PNG, WebP or GIF') || message.includes('5 MB or smaller')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Page image upload failed' }, { status: 500 });
  }
}
