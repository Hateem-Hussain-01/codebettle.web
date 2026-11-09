/**
 * Blog PDF storage (Phase 3) — Supabase Storage, server-side only.
 *
 * Supabase is the Postgres host + file Storage only; there is no Supabase
 * Auth anywhere in this app (auth stays custom bcrypt sessions).
 *
 * The client is built from the server-only SUPABASE_SERVICE_ROLE_KEY
 * (never the publishable key: uploads must bypass row-level storage
 * policies that a public key cannot satisfy). The key is read from
 * process.env at call time and is never logged, returned, or stored.
 * If the key (or the project URL) is missing, the getter throws an error
 * naming the exact env var — the upload route maps that to HTTP 503.
 *
 * NO live upload happens here or in tests: the key is not available on
 * this VM. Tests pass a mock client instead of calling the getter.
 * Live setup goes in the runbook: create the `blog-pdfs` bucket in the
 * Supabase dashboard (Storage -> New bucket, private) and set
 * SUPABASE_SERVICE_ROLE_KEY in .env.local / Vercel env vars.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

export const BLOG_PDF_BUCKET = 'blog-pdfs';
export const MAX_BLOG_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

export interface BlogPdfFile {
  name: string;
  type: string;
  size: number;
  /** Raw bytes, or a function returning them (like File.arrayBuffer). */
  arrayBuffer: ArrayBuffer | Buffer | (() => Promise<ArrayBuffer>);
}

/** Build the service-role storage client. Throws naming the missing env var. */
export function getBlogStorageClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('Supabase URL is not set (expected NEXT_PUBLIC_SUPABASE_URL)');
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — blog PDF uploads need the Supabase service-role key (server-only env var)',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Upload a blog PDF to `blog-pdfs/blogs/<uuid>.pdf`.
 * Returns the public URL and the storage path. The path (not the URL) is
 * what deleteBlogPdf needs. Validation runs before the client is built,
 * so a bad file is a 400 even when the service-role key is missing.
 */
export async function uploadBlogPdf(
  file: BlogPdfFile,
  client?: SupabaseClient,
): Promise<{ url: string; path: string }> {
  if (file.type !== 'application/pdf') {
    throw new Error('Only PDF files are allowed');
  }
  if (file.size > MAX_BLOG_PDF_BYTES) {
    throw new Error('PDF must be 10 MB or smaller');
  }
  const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file.arrayBuffer;
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (body.byteLength > MAX_BLOG_PDF_BYTES) {
    throw new Error('PDF must be 10 MB or smaller');
  }
  const storage = client ?? getBlogStorageClient();
  const path = `blogs/${randomUUID()}.pdf`;
  const { data, error } = await storage.storage
    .from(BLOG_PDF_BUCKET)
    .upload(path, body, { contentType: 'application/pdf', upsert: false });
  if (error || !data) {
    throw new Error(`Blog PDF upload failed: ${error?.message ?? 'unknown error'}`);
  }
  const { data: publicUrl } = storage.storage.from(BLOG_PDF_BUCKET).getPublicUrl(data.path);
  return { url: publicUrl.publicUrl, path: data.path };
}

/** Delete a previously uploaded blog PDF by its storage path (e.g. `blogs/<uuid>.pdf`). */
export async function deleteBlogPdf(path: string, client?: SupabaseClient): Promise<void> {
  const storage = client ?? getBlogStorageClient();
  const { error } = await storage.storage.from(BLOG_PDF_BUCKET).remove([path]);
  if (error) {
    throw new Error(`Blog PDF delete failed: ${error.message}`);
  }
}
