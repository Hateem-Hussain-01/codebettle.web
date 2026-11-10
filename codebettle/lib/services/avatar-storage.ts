/**
 * Avatar storage — Supabase Storage, server-side only.
 *
 * Same pattern as lib/services/blog-storage.ts (blog-pdfs) and
 * lib/services/quiz-storage.ts (quiz-pdfs): the service-role key
 * (server-only) builds the client; a missing key throws naming the env
 * var, and the upload route maps that to HTTP 503.
 *
 * One deliberate difference: the `avatars` bucket must be PUBLIC, not
 * private like blog-pdfs / quiz-pdfs. Avatars render in plain <img> tags
 * in the portal top bar and sidebar, which cannot mint signed URLs, so
 * the stored URL has to be directly loadable. A profile photo is public
 * by nature; nothing sensitive is stored here.
 *
 * NO live upload happens here or in tests: the key is not available on
 * this VM. Tests pass a mock client instead of calling the getter.
 * Live setup goes in the runbook: create the `avatars` bucket in the
 * Supabase dashboard (Storage -> New bucket, PUBLIC) and set
 * SUPABASE_SERVICE_ROLE_KEY in .env.local / Vercel env vars.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

export const AVATAR_BUCKET = 'avatars';
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export interface AvatarFile {
  name: string;
  type: string;
  size: number;
  /** Raw bytes, or a function returning them (like File.arrayBuffer). */
  arrayBuffer: ArrayBuffer | Buffer | (() => Promise<ArrayBuffer>);
}

/** Build the service-role storage client. Throws naming the missing env var. */
export function getAvatarStorageClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('Supabase URL is not set (expected NEXT_PUBLIC_SUPABASE_URL)');
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — avatar uploads need the Supabase service-role key (server-only env var)',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Upload a profile photo to `avatars/<userId>/<uuid>.<ext>`.
 * Returns the public URL and the storage path. The URL is what gets
 * saved to User.avatar; the path is what deleteAvatar needs.
 * Validation runs before the client is built, so a bad file is a 400
 * even when the service-role key is missing.
 */
export async function uploadAvatar(
  userId: string,
  file: AvatarFile,
  client?: SupabaseClient,
): Promise<{ url: string; path: string }> {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    throw new Error('Only JPG, PNG, WebP or GIF images are allowed');
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('Photo must be 5 MB or smaller');
  }
  const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file.arrayBuffer;
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (body.byteLength > MAX_AVATAR_BYTES) {
    throw new Error('Photo must be 5 MB or smaller');
  }
  const storage = client ?? getAvatarStorageClient();
  const path = `${userId}/${randomUUID()}.${EXTENSIONS[file.type]}`;
  const { data, error } = await storage.storage
    .from(AVATAR_BUCKET)
    .upload(path, body, { contentType: file.type, upsert: false });
  if (error || !data) {
    throw new Error(`Avatar upload failed: ${error?.message ?? 'unknown error'}`);
  }
  const { data: publicUrl } = storage.storage.from(AVATAR_BUCKET).getPublicUrl(data.path);
  return { url: publicUrl.publicUrl, path: data.path };
}

/** Delete a previously uploaded avatar by its storage path (e.g. `<userId>/<uuid>.jpg`). */
export async function deleteAvatar(path: string, client?: SupabaseClient): Promise<void> {
  const storage = client ?? getAvatarStorageClient();
  const { error } = await storage.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) {
    throw new Error(`Avatar delete failed: ${error.message}`);
  }
}
