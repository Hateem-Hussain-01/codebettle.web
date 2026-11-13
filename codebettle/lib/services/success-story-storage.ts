/**
 * Success story file storage — Supabase Storage, server-side only.
 *
 * Two buckets, by sensitivity:
 * - `success-stories` (PUBLIC): profile pictures (`profiles/<uuid>.<ext>`)
 *   and video testimonials (`videos/<uuid>.<ext>`). Both are meant for
 *   publication once the story is approved, so a plain public URL is
 *   correct — same reasoning as the public `avatars` bucket. Before
 *   approval nothing links to them publicly (unpredictable UUID paths).
 * - `application-files` (PRIVATE, existing): achievement evidence
 *   documents (`evidence/<uuid>.<ext>`). Offer letters and
 *   certificates are personal documents — they must never be reachable
 *   from a plain public URL. An admin opens one only through a
 *   short-lived signed URL (createSuccessStoryEvidenceSignedUrl).
 *
 * Upload transport: files NEVER travel through the API route. The
 * browser asks POST /api/success-stories/upload-url for a signed
 * upload URL (validated here: kind + MIME + size), then PUTs the file
 * directly to Supabase Storage. This is what makes the 100 MB video
 * limit honest — Vercel serverless functions cap request payloads at
 * ~4.5 MB, so a video could never arrive through the API route.
 * The submit endpoint re-validates every referenced file server-side
 * (verifySuccessStoryFile: existence + size + MIME from Storage).
 *
 * NO live upload happens here or in tests: the key is not available on
 * this VM. Tests pass a mock client instead of calling the getter.
 * Live setup: create the `success-stories` bucket in the Supabase
 * dashboard (Storage -> New bucket, PUBLIC) — or run
 * create-success-stories-bucket.py — and set SUPABASE_SERVICE_ROLE_KEY
 * in .env.local / Vercel env vars.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import {
  EVIDENCE_MIMES,
  MAX_EVIDENCE_BYTES,
  MAX_PROFILE_PICTURE_BYTES,
  MAX_VIDEO_BYTES,
  PROFILE_PICTURE_MIMES,
  VIDEO_MIMES,
  extensionForMime,
} from '../success-story-validation';
import { APPLICATION_FILES_BUCKET } from './application-storage';

export const SUCCESS_STORIES_BUCKET = 'success-stories';

export type SuccessStoryUploadKind = 'profile' | 'evidence' | 'video';

const KIND_CONFIG: Record<
  SuccessStoryUploadKind,
  { bucket: string; prefix: string; mimes: readonly string[]; maxBytes: number }
> = {
  profile: {
    bucket: SUCCESS_STORIES_BUCKET,
    prefix: 'profiles',
    mimes: PROFILE_PICTURE_MIMES,
    maxBytes: MAX_PROFILE_PICTURE_BYTES,
  },
  evidence: {
    bucket: APPLICATION_FILES_BUCKET,
    prefix: 'evidence',
    mimes: EVIDENCE_MIMES,
    maxBytes: MAX_EVIDENCE_BYTES,
  },
  video: {
    bucket: SUCCESS_STORIES_BUCKET,
    prefix: 'videos',
    mimes: VIDEO_MIMES,
    maxBytes: MAX_VIDEO_BYTES,
  },
};

/** Test hook: inject a fake storage client (same pattern as __setDbClient). Never call in production code. */
let testStorageClient: SupabaseClient | null | undefined;
export function __setSuccessStoryStorageClient(client: SupabaseClient | null): void {
  testStorageClient = client;
}

/** Test hook: restore the real env-based client. Never call in production code. */
export function __resetSuccessStoryStorageClient(): void {
  testStorageClient = undefined;
}

/** Build the service-role storage client. Throws naming the missing env var. */
export function getSuccessStoryStorageClient(): SupabaseClient {
  if (testStorageClient !== undefined) {
    if (testStorageClient === null) throw new Error('Test storage client is not set');
    return testStorageClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('Supabase URL is not set (expected NEXT_PUBLIC_SUPABASE_URL)');
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — success story uploads need the Supabase service-role key (server-only env var)',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface SignedUpload {
  /** Full URL the browser PUTs the file bytes to (includes the token). */
  signedUrl: string;
  /** Storage path the file will live at (sent back with the submission). */
  path: string;
  bucket: string;
  expiresInSeconds: number;
}

/**
 * Mint a signed upload URL for one file. Validates kind + MIME + size
 * BEFORE touching Storage, so a bad file is a 400 even when the
 * service-role key is missing.
 */
export async function createSuccessStorySignedUpload(
  kind: SuccessStoryUploadKind,
  mime: string,
  size: number,
  client?: SupabaseClient,
): Promise<SignedUpload> {
  const config = KIND_CONFIG[kind];
  if (!config) throw new Error('Upload kind is not valid');
  if (!config.mimes.includes(mime)) {
    throw new Error(`File type ${mime} is not allowed for this upload`);
  }
  if (!Number.isFinite(size) || size <= 0 || size > config.maxBytes) {
    throw new Error(`File must be ${Math.round(config.maxBytes / (1024 * 1024))} MB or smaller`);
  }
  const ext = extensionForMime(mime, kind === 'profile' ? 'profile' : kind === 'evidence' ? 'evidence' : 'video');
  if (!ext) throw new Error(`File type ${mime} is not allowed for this upload`);
  const storage = client ?? getSuccessStoryStorageClient();
  const path = `${config.prefix}/${randomUUID()}.${ext}`;
  const { data, error } = await storage.storage.from(config.bucket).createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`Could not prepare the upload: ${error?.message ?? 'unknown error'}`);
  }
  return { signedUrl: data.signedUrl, path, bucket: config.bucket, expiresInSeconds: 3600 };
}

/** Public URL for a file in the public `success-stories` bucket. */
export function getSuccessStoryPublicUrl(path: string, client?: SupabaseClient): string {
  const storage = client ?? getSuccessStoryStorageClient();
  return storage.storage.from(SUCCESS_STORIES_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Short-lived signed URL for a private evidence file (admin only). */
export async function createSuccessStoryEvidenceSignedUrl(
  path: string,
  expiresInSeconds = 3600,
  client?: SupabaseClient,
): Promise<string> {
  const storage = client ?? getSuccessStoryStorageClient();
  const { data, error } = await storage.storage
    .from(APPLICATION_FILES_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`Could not open the file: ${error?.message ?? 'unknown error'}`);
  }
  return data.signedUrl;
}

export interface StoredFileInfo {
  exists: boolean;
  size?: number;
  mime?: string;
}

/**
 * Verify a referenced file actually exists in Storage, with its size
 * and MIME from Storage metadata. Used by the submit endpoint — a
 * client-supplied path is never trusted on its own.
 */
export async function verifySuccessStoryFile(
  bucket: string,
  path: string,
  client?: SupabaseClient,
): Promise<StoredFileInfo> {
  const storage = client ?? getSuccessStoryStorageClient();
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash) : '';
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const { data, error } = await storage.storage.from(bucket).list(dir || undefined, { limit: 100 });
  if (error || !data) return { exists: false };
  const found = data.find((f) => f.name === name);
  if (!found) return { exists: false };
  const meta = (found as { metadata?: { size?: number; mimetype?: string } }).metadata;
  return {
    exists: true,
    size: typeof meta?.size === 'number' ? meta.size : undefined,
    mime: typeof meta?.mimetype === 'string' ? meta.mimetype : undefined,
  };
}

/** Delete a stored file (used when a submission is deleted). Best-effort: never throws. */
export async function deleteSuccessStoryFile(
  bucket: string,
  path: string,
  client?: SupabaseClient,
): Promise<void> {
  try {
    const storage = client ?? getSuccessStoryStorageClient();
    await storage.storage.from(bucket).remove([path]);
  } catch {
    // Best-effort cleanup — a leftover file is not a submission failure.
  }
}

/** The bucket a stored path lives in, from its prefix. */
export function bucketForSuccessStoryPath(path: string): string | null {
  if (path.startsWith('profiles/') || path.startsWith('videos/')) return SUCCESS_STORIES_BUCKET;
  if (path.startsWith('evidence/')) return APPLICATION_FILES_BUCKET;
  return null;
}
