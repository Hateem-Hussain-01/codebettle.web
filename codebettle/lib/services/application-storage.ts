/**
 * Instructor-application file storage — Supabase Storage, server-side only.
 *
 * Same pattern as lib/services/blog-storage.ts (blog-pdfs),
 * lib/services/quiz-storage.ts (quiz-pdfs) and
 * lib/services/avatar-storage.ts (avatars): the service-role key
 * (server-only) builds the client; a missing key throws naming the env
 * var, and the upload route maps that to HTTP 503.
 *
 * One deliberate difference: the `application-files` bucket must be
 * PRIVATE, not public like `avatars`. CVs and demo lecture recordings
 * are personal documents — they must never be reachable from a plain
 * public URL. What gets stored on the application is the storage PATH
 * (e.g. `cvs/<uuid>.pdf`), not a URL; an admin mints a short-lived
 * signed URL for it through createApplicationFileSignedUrl (see
 * app/api/admin/applications/[id]/file/route.ts).
 *
 * NO live upload happens here or in tests: the key is not available on
 * this VM. Tests pass a mock client instead of calling the getter.
 * Live setup: create the `application-files` bucket in the Supabase
 * dashboard (Storage -> New bucket, PRIVATE) and set
 * SUPABASE_SERVICE_ROLE_KEY in .env.local / Vercel env vars. There is
 * also an idempotent SQL fallback in
 * ~/workspace/your_files/codebettle-instructor-application-uploads-migration.sql.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

export const APPLICATION_FILES_BUCKET = 'application-files';
export const MAX_CV_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_DEMO_RECORDING_BYTES = 100 * 1024 * 1024; // 100 MB
export const ALLOWED_CV_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
export const ALLOWED_DEMO_RECORDING_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

const CV_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

const DEMO_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export type ApplicationFileKind = 'cv' | 'demo';

export interface ApplicationFile {
  name: string;
  type: string;
  size: number;
  /** Raw bytes, or a function returning them (like File.arrayBuffer). */
  arrayBuffer: ArrayBuffer | Buffer | (() => Promise<ArrayBuffer>);
}

/** Build the service-role storage client. Throws naming the missing env var. */
export function getApplicationStorageClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('Supabase URL is not set (expected NEXT_PUBLIC_SUPABASE_URL)');
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — application file uploads need the Supabase service-role key (server-only env var)',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readBytes(file: ApplicationFile): Promise<Buffer> {
  const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file.arrayBuffer;
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
}

/**
 * Upload one application file to `application-files/<kind>s/<uuid>.<ext>`.
 * Returns the storage path — that is what gets saved to
 * InstructorApplication.cvUrl / demoRecordingUrl. Validation runs
 * before the client is built, so a bad file is a 400 even when the
 * service-role key is missing.
 */
export async function uploadApplicationFile(
  kind: ApplicationFileKind,
  file: ApplicationFile,
  client?: SupabaseClient,
): Promise<{ path: string }> {
  const allowed = kind === 'cv' ? ALLOWED_CV_TYPES : ALLOWED_DEMO_RECORDING_TYPES;
  const maxBytes = kind === 'cv' ? MAX_CV_BYTES : MAX_DEMO_RECORDING_BYTES;
  const extensions = kind === 'cv' ? CV_EXTENSIONS : DEMO_EXTENSIONS;
  const label = kind === 'cv' ? 'CV' : 'Demo recording';
  if (!allowed.includes(file.type)) {
    throw new Error(
      kind === 'cv'
        ? 'Only PDF, DOC or DOCX files are allowed for the CV'
        : 'Only MP4, WebM or MOV videos are allowed for the demo recording',
    );
  }
  if (file.size > maxBytes) {
    throw new Error(`${label} must be ${kind === 'cv' ? '5 MB' : '100 MB'} or smaller`);
  }
  const body = await readBytes(file);
  if (body.byteLength > maxBytes) {
    throw new Error(`${label} must be ${kind === 'cv' ? '5 MB' : '100 MB'} or smaller`);
  }
  const storage = client ?? getApplicationStorageClient();
  const path = `${kind === 'cv' ? 'cvs' : 'demos'}/${randomUUID()}.${extensions[file.type]}`;
  const { data, error } = await storage.storage
    .from(APPLICATION_FILES_BUCKET)
    .upload(path, body, { contentType: file.type, upsert: false });
  if (error || !data) {
    throw new Error(`Application file upload failed: ${error?.message ?? 'unknown error'}`);
  }
  return { path: data.path };
}

/**
 * Mint a short-lived signed URL for a stored application file, so an
 * admin can view/download a CV or demo recording from the private
 * bucket. `expiresInSeconds` defaults to 1 hour.
 */
export async function createApplicationFileSignedUrl(
  path: string,
  expiresInSeconds = 3600,
  client?: SupabaseClient,
): Promise<string> {
  const storage = client ?? getApplicationStorageClient();
  const { data, error } = await storage.storage
    .from(APPLICATION_FILES_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`Could not open the file: ${error?.message ?? 'unknown error'}`);
  }
  return data.signedUrl;
}

/** Delete a previously uploaded application file by its storage path. */
export async function deleteApplicationFile(path: string, client?: SupabaseClient): Promise<void> {
  const storage = client ?? getApplicationStorageClient();
  const { error } = await storage.storage.from(APPLICATION_FILES_BUCKET).remove([path]);
  if (error) {
    throw new Error(`Application file delete failed: ${error.message}`);
  }
}

/**
 * Module 3: is this a storage path the upload route itself returned
 * (`cvs/<uuid>.pdf|doc|docx` or `demos/<uuid>.mp4|webm|mov`)? The
 * public DELETE cleanup endpoint only ever deletes paths matching
 * this shape — it can never be pointed at another bucket path, and
 * CVs are documents while demos are videos, never the other way round.
 */
const APPLICATION_FILE_PATH_PATTERN =
  /^(cvs|demos)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|doc|docx|mp4|webm|mov)$/;

export function isApplicationFilePath(path: string): boolean {
  if (!APPLICATION_FILE_PATH_PATTERN.test(path)) return false;
  const [dir, file] = path.split('/');
  const ext = file.split('.').pop() ?? '';
  if (dir === 'cvs') return ['pdf', 'doc', 'docx'].includes(ext);
  return ['mp4', 'webm', 'mov'].includes(ext);
}
