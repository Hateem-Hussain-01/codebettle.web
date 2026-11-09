/**
 * Quiz PDF storage (Phase 5) — Supabase Storage, server-side only.
 *
 * Same pattern as lib/services/blog-storage.ts: the service-role key
 * (server-only) builds the client; a missing key throws naming the env
 * var, and the upload route maps that to HTTP 503. The original uploaded
 * quiz PDF is stored separately from the structured quiz data (master
 * prompt §6D) in the private `quiz-pdfs` bucket.
 *
 * NO live upload happens here or in tests: the key is not available on
 * this VM. Tests pass a mock client. Live setup goes in the runbook:
 * create the `quiz-pdfs` bucket (private) and set
 * SUPABASE_SERVICE_ROLE_KEY in .env.local / Vercel env vars.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

export const QUIZ_PDF_BUCKET = 'quiz-pdfs';
export const MAX_QUIZ_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

export interface QuizPdfFile {
  name: string;
  type: string;
  size: number;
  /** Raw bytes, or a function returning them (like File.arrayBuffer). */
  arrayBuffer: ArrayBuffer | Buffer | (() => Promise<ArrayBuffer>);
}

/** Build the service-role storage client. Throws naming the missing env var. */
export function getQuizStorageClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('Supabase URL is not set (expected NEXT_PUBLIC_SUPABASE_URL)');
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — quiz PDF uploads need the Supabase service-role key (server-only env var)',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Upload a teacher's quiz PDF to `quiz-pdfs/quizzes/<uuid>.pdf`.
 * Returns the public URL and the storage path. Validation runs before
 * the client is built, so a bad file is a 400 even when the key is missing.
 */
export async function uploadQuizPdf(
  file: QuizPdfFile,
  client?: SupabaseClient,
): Promise<{ url: string; path: string }> {
  if (file.type !== 'application/pdf') {
    throw new Error('Only PDF files are allowed');
  }
  if (file.size > MAX_QUIZ_PDF_BYTES) {
    throw new Error('PDF must be 10 MB or smaller');
  }
  const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file.arrayBuffer;
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (body.byteLength > MAX_QUIZ_PDF_BYTES) {
    throw new Error('PDF must be 10 MB or smaller');
  }
  if (body.byteLength < 4 || body.subarray(0, 4).toString('latin1') !== '%PDF') {
    throw new Error('The uploaded file is not a PDF');
  }
  const storage = client ?? getQuizStorageClient();
  const path = `quizzes/${randomUUID()}.pdf`;
  const { data, error } = await storage.storage
    .from(QUIZ_PDF_BUCKET)
    .upload(path, body, { contentType: 'application/pdf', upsert: false });
  if (error || !data) {
    throw new Error(`Quiz PDF upload failed: ${error?.message ?? 'unknown error'}`);
  }
  const { data: publicUrl } = storage.storage.from(QUIZ_PDF_BUCKET).getPublicUrl(data.path);
  return { url: publicUrl.publicUrl, path: data.path };
}

/** Delete a previously uploaded quiz PDF by its storage path (e.g. `quizzes/<uuid>.pdf`). */
export async function deleteQuizPdf(path: string, client?: SupabaseClient): Promise<void> {
  const storage = client ?? getQuizStorageClient();
  const { error } = await storage.storage.from(QUIZ_PDF_BUCKET).remove([path]);
  if (error) {
    throw new Error(`Quiz PDF delete failed: ${error.message}`);
  }
}
