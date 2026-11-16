/**
 * Team file storage (Team Portal, Eman 16 Nov 2026) — Supabase Storage,
 * server-side only.
 *
 * Same pattern as lib/services/payment-proof-storage.ts
 * (payment-proofs) and lib/services/application-storage.ts
 * (application-files): the service-role key (server-only) builds the
 * client; a missing key throws naming the env var, and the upload
 * route maps that to HTTP 503.
 *
 * The `team-files` bucket must be PRIVATE: shared internal files must
 * never be reachable from a plain public URL. What gets stored on the
 * TeamFile row is the storage PATH (e.g. `team-files/<uuid>.pdf`), not
 * a URL; a team member or admin mints a short-lived signed URL for it
 * through createTeamFileSignedUrl (see
 * app/api/team/files/[id]/route.ts).
 *
 * NO live upload happens here or in tests: the key is not available on
 * this VM. Tests pass a mock client instead of calling the getter.
 * Live setup: create the `team-files` bucket in the Supabase dashboard
 * (Storage -> New bucket, PRIVATE) and set SUPABASE_SERVICE_ROLE_KEY
 * in .env.local / Vercel env vars. Until the bucket exists, upload
 * shows a clear "not set up yet" message instead of a 500.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readUploadedBytes, validateUploadedBytes } from './file-validation';

export const TEAM_FILES_BUCKET = 'team-files';
export const MAX_TEAM_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_TEAM_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
] as const;

const TEAM_FILE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
};

export interface TeamFileUpload {
  name: string;
  type: string;
  size: number;
  /** Raw bytes, or a function returning them (like File.arrayBuffer). */
  arrayBuffer: ArrayBuffer | Buffer | (() => Promise<ArrayBuffer>);
}

/** Build the service-role storage client. Throws naming the missing env var. */
export function getTeamFileStorageClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('Supabase URL is not set (expected NEXT_PUBLIC_SUPABASE_URL)');
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — team file uploads need the Supabase service-role key (server-only env var)',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function uploadTeamFile(
  file: TeamFileUpload,
  client?: SupabaseClient,
): Promise<{ path: string }> {
  // Magic-byte validation: the bytes must match the claimed type — a
  // renamed file is rejected. (Same rule as payment proofs.)
  const body = await readUploadedBytes(file);
  const problem = validateUploadedBytes(
    file.type,
    file.size,
    body,
    ALLOWED_TEAM_FILE_TYPES,
    MAX_TEAM_FILE_BYTES,
    'Only images, PDF, Office documents, text/CSV or ZIP files are allowed for team files',
    'Team file must be 10 MB or smaller',
  );
  if (problem) throw new Error(problem);
  const storage = client ?? getTeamFileStorageClient();
  const path = `team-files/${randomUUID()}.${TEAM_FILE_EXTENSIONS[file.type]}`;
  const { data, error } = await storage.storage
    .from(TEAM_FILES_BUCKET)
    .upload(path, body, { contentType: file.type, upsert: false });
  if (error || !data) {
    throw new Error(`Team file upload failed: ${error?.message ?? 'unknown error'}`);
  }
  return { path: data.path };
}

/**
 * Mint a short-lived signed URL for a stored team file, so a team
 * member or admin can download it from the PRIVATE `team-files`
 * bucket. `expiresInSeconds` defaults to 1 hour.
 */
export async function createTeamFileSignedUrl(
  path: string,
  expiresInSeconds = 3600,
  client?: SupabaseClient,
): Promise<string> {
  const storage = client ?? getTeamFileStorageClient();
  const { data, error } = await storage.storage
    .from(TEAM_FILES_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`Could not open the file: ${error?.message ?? 'unknown error'}`);
  }
  return data.signedUrl;
}

/** Delete a previously uploaded team file by its storage path. */
export async function deleteTeamFileFromStorage(path: string, client?: SupabaseClient): Promise<void> {
  const storage = client ?? getTeamFileStorageClient();
  const { error } = await storage.storage.from(TEAM_FILES_BUCKET).remove([path]);
  if (error) {
    throw new Error(`Team file delete failed: ${error.message}`);
  }
}
