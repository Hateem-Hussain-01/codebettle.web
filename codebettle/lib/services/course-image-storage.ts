/**
 * Course-image storage (Phase 4, Module 2) — Supabase Storage, server-side only.
 *
 * Same pattern as lib/services/avatar-storage.ts (`avatars`) and
 * lib/services/blog-storage.ts (`blog-pdfs`): the service-role key
 * (server-only) builds the client; a missing key throws naming the env
 * var, and the upload route maps that to HTTP 503.
 *
 * One deliberate difference from blog-pdfs / quiz-pdfs: the
 * `course-images` bucket must be PUBLIC, like `avatars`. Course
 * thumbnails render in plain <img> tags on the public catalogue, course
 * pages and portals, which cannot mint signed URLs, so the stored URL
 * has to be directly loadable. A course thumbnail is public by nature;
 * nothing sensitive is stored here.
 *
 * NO live upload happens here or in tests: the key is not available on
 * this VM. Tests pass a mock client instead of calling the getter.
 * Live setup: run create-course-images-bucket.py at the repo root
 * (Storage -> New bucket, `course-images`, PUBLIC) and set
 * SUPABASE_SERVICE_ROLE_KEY in .env.local / Vercel env vars.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { ALLOWED_COURSE_IMAGE_TYPES, MAX_COURSE_IMAGE_BYTES } from '../thumbnail';

export const COURSE_IMAGE_BUCKET = 'course-images';
export { ALLOWED_COURSE_IMAGE_TYPES, MAX_COURSE_IMAGE_BYTES };

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export interface CourseImageFile {
  name: string;
  type: string;
  size: number;
  /** Raw bytes, or a function returning them (like File.arrayBuffer). */
  arrayBuffer: ArrayBuffer | Buffer | (() => Promise<ArrayBuffer>);
}

/** Build the service-role storage client. Throws naming the missing env var. */
export function getCourseImageStorageClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('Supabase URL is not set (expected NEXT_PUBLIC_SUPABASE_URL)');
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — course image uploads need the Supabase service-role key (server-only env var)',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Upload a course thumbnail to `course-images/courses/<courseId>/<uuid>.<ext>`.
 * `courseId` is 'pending' for the create-form flow (no course exists yet);
 * the public URL stays valid once the course is created.
 * Returns the public URL and the storage path. The URL is what gets saved
 * to Course.thumbnail; the path is what deleteCourseImage needs.
 * Validation runs before the client is built, so a bad file is a 400
 * even when the service-role key is missing.
 */
export async function uploadCourseImage(
  courseId: string,
  file: CourseImageFile,
  client?: SupabaseClient,
): Promise<{ url: string; path: string }> {
  if (!(ALLOWED_COURSE_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Only JPG, PNG, WebP or GIF images are allowed');
  }
  if (file.size > MAX_COURSE_IMAGE_BYTES) {
    throw new Error('Image must be 5 MB or smaller');
  }
  const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file.arrayBuffer;
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (body.byteLength > MAX_COURSE_IMAGE_BYTES) {
    throw new Error('Image must be 5 MB or smaller');
  }
  const storage = client ?? getCourseImageStorageClient();
  const path = `courses/${courseId}/${randomUUID()}.${EXTENSIONS[file.type]}`;
  const { data, error } = await storage.storage
    .from(COURSE_IMAGE_BUCKET)
    .upload(path, body, { contentType: file.type, upsert: false });
  if (error || !data) {
    throw new Error(`Course image upload failed: ${error?.message ?? 'unknown error'}`);
  }
  const { data: publicUrl } = storage.storage.from(COURSE_IMAGE_BUCKET).getPublicUrl(data.path);
  return { url: publicUrl.publicUrl, path: data.path };
}

/** Delete a previously uploaded course image by its storage path (e.g. `courses/<id>/<uuid>.jpg`). */
export async function deleteCourseImage(path: string, client?: SupabaseClient): Promise<void> {
  const storage = client ?? getCourseImageStorageClient();
  const { error } = await storage.storage.from(COURSE_IMAGE_BUCKET).remove([path]);
  if (error) {
    throw new Error(`Course image delete failed: ${error.message}`);
  }
}

/**
 * Storage path for a thumbnail URL that lives in the `course-images`
 * bucket (e.g. `courses/<id>/<uuid>.jpg`), or null for anything else
 * (Unsplash / external / relative URLs are never storage paths, so they
 * are never deleted). The path must live under `courses/` — anything
 * else in the bucket is not a course thumbnail.
 */
export function courseImagePathFromUrl(url: string): string | null {
  const marker = `/${COURSE_IMAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = decodeURIComponent(url.slice(idx + marker.length).split(/[?#]/)[0]);
  if (!path.startsWith('courses/') || path === 'courses/') return null;
  return path;
}
