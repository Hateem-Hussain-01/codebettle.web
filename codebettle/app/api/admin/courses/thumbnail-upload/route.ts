import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { uploadCourseImage } from '@/lib/services/course-image-storage';

/**
 * POST /api/admin/courses/thumbnail-upload — upload a course thumbnail
 * before the course exists (admin only). Used by the admin create form:
 * the admin uploads the image first, then creates the course with the
 * returned URL. multipart/form-data with a single `thumbnail` field.
 * JPG/PNG/WebP/GIF, 5 MB max. The image goes to the public
 * `course-images` bucket (`courses/pending/<uuid>.<ext>`) and the
 * public URL stays valid once the course is created.
 * Returns { url, path } — store the url as the new course's thumbnail.
 *
 * Same 503 contract as POST /api/admin/courses/[id]/thumbnail: missing
 * service-role key or missing `course-images` bucket is a plain-message
 * 503, never a stack trace, never the key.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('courses');
  if ('error' in auth) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const file = form.get('thumbnail');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'An image file is required' }, { status: 400 });
  }
  try {
    const { url, path } = await uploadCourseImage('pending', {
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
        { error: 'Course image uploads are not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    if (message.includes('Bucket not found')) {
      return NextResponse.json(
        { error: 'Course image uploads are not set up yet (the course-images bucket does not exist in Supabase Storage)' },
        { status: 503 },
      );
    }
    if (
      message.includes('Only JPG, PNG, WebP or GIF') ||
      message.includes('5 MB or smaller')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Course image upload failed' }, { status: 500 });
  }
}
