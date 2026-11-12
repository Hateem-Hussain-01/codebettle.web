import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea, serviceError } from '@/lib/api-helpers';
import { getCourseById } from '@/lib/db/courses';
import { updateCourseService } from '@/lib/services/course-service';
import { courseImagePathFromUrl, deleteCourseImage, uploadCourseImage } from '@/lib/services/course-image-storage';

/**
 * POST /api/admin/courses/[id]/thumbnail — change a course's thumbnail (admin only).
 * multipart/form-data with a single `thumbnail` field. JPG/PNG/WebP/GIF,
 * 5 MB max. The image goes to the public `course-images` bucket in
 * Supabase Storage and the public URL is saved to Course.thumbnail, so
 * every render site (catalogue, course page, portals) picks it up on
 * the next load. Returns { course, url, path }.
 *
 * When the Supabase service-role key is not configured, this returns 503
 * with a plain message — never a stack trace, never the key. When the
 * `course-images` bucket does not exist yet in Supabase Storage, this
 * returns 503 naming the bucket (run create-course-images-bucket.py at
 * the repo root: Storage -> New bucket -> `course-images`, Public).
 * Replacing a thumbnail stored in `course-images` deletes the old file
 * (best-effort, never blocks the update); external URLs (e.g. the seed
 * Unsplash thumbnails) are left alone.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('courses');
  if ('error' in auth) return auth.error;
  const { id } = await params;

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

  const existing = await getCourseById(id);
  if (!existing) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  try {
    const { url, path } = await uploadCourseImage(id, {
      name: file.name,
      type: file.type,
      size: file.size,
      arrayBuffer: await file.arrayBuffer(),
    });
    const result = await updateCourseService(auth.session, id, { thumbnail: url });
    if ('error' in result) return serviceError(result);
    const oldPath = courseImagePathFromUrl(existing.thumbnail);
    if (oldPath) {
      try {
        await deleteCourseImage(oldPath);
      } catch (e) {
        console.error('Could not delete old course thumbnail', oldPath, e);
      }
    }
    return NextResponse.json({ course: result.course, url, path });
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
