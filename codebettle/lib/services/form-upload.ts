/**
 * Form-submission file storage — Supabase Storage, server-side only.
 *
 * Mirrors lib/services/application-storage.ts (same private
 * `application-files` bucket, same service-role client, same
 * fail-before-touching-storage validation order). Submission files
 * live under `form-uploads/<formId>/<uuid>.<ext>` in that bucket —
 * NO new bucket: applicant uploads are already private there, and
 * form uploads get the same privacy for free. What gets stored on
 * the submission is the storage PATH (see lib/form-uploads.ts), not
 * a URL; an admin mints a short-lived signed URL for it through
 * createFormFileSignedUrl (see the admin file route).
 *
 * Validation is server-side and mandatory — the browser's `accept`
 * attribute is only a hint. A file must pass ALL of:
 *  1. declared MIME in the variant's allowlist,
 *  2. filename extension present and matching that MIME
 *     (MIME_TO_EXTENSION — a .pdf must BE application/pdf, etc.),
 *  3. declared size AND actual byte length within the 5 MB limit,
 *  4. magic bytes matching the claimed type, where the format has
 *     reliable magic bytes (PDF, images, Office docs, MP4/WebM/MOV).
 *     This is what catches a .exe renamed to .pdf: the browser
 *     reports application/pdf for it (MIME comes from the extension)
 *     and the extension agrees, but the bytes start with MZ, not
 *     %PDF. Plain-text types (txt/csv/md/rtf) have no reliable magic
 *     bytes, so for those the MIME + extension check is the whole
 *     defence — an executable renamed to .txt is still just text to
 *     any reader, and the stored file is never executed.
 *
 * NO live upload happens here or in tests: the key is not available
 * on this VM. Tests pass a mock client instead of calling the getter.
 * Live setup: none — the `application-files` bucket already exists
 * (private) and SUPABASE_SERVICE_ROLE_KEY is already set for the
 * application uploads. If the bucket is missing on live Supabase,
 * uploads fail with a clear "Bucket not found" 503 (see the route).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import {
  APPLICATION_FILES_BUCKET,
  getApplicationStorageClient,
} from './application-storage';
import {
  fileExtensionOf,
  formIdOfUploadPath,
  isFormUploadPath,
  MIME_TO_EXTENSION,
  uploadVariantConfig,
  type FormFileReference,
  type UploadVariant,
} from '../form-uploads';

export { APPLICATION_FILES_BUCKET };

/** Prefix under which every form-submission file is stored. */
export const FORM_UPLOADS_PREFIX = 'form-uploads';

export interface FormUploadFile {
  name: string;
  type: string;
  size: number;
  /** Raw bytes, or a function returning them (like File.arrayBuffer). */
  arrayBuffer: ArrayBuffer | Buffer | (() => Promise<ArrayBuffer>);
}

/**
 * Upload errors carry an HTTP status so routes can answer precisely:
 * 400 = the file itself is bad (type/extension/size/content),
 * 503 = uploads are not configured / bucket missing,
 * 500 = anything else from storage.
 */
export class FormUploadError extends Error {
  status: 400 | 503 | 500;
  /** Field id the error belongs to (for per-field 400s), when known. */
  fieldId?: string;

  constructor(message: string, status: 400 | 503 | 500, fieldId?: string) {
    super(message);
    this.name = 'FormUploadError';
    this.status = status;
    this.fieldId = fieldId;
  }
}

async function readBytes(file: FormUploadFile): Promise<Buffer> {
  const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file.arrayBuffer;
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
}

/** True when `bytes` starts with `prefix` (ASCII prefix, e.g. '%PDF'). */
function startsWith(bytes: Buffer, prefix: string): boolean {
  return bytes.length >= prefix.length && bytes.subarray(0, prefix.length).toString('latin1') === prefix;
}

function startsWithBytes(bytes: Buffer, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((b, i) => bytes[i] === b);
}

/**
 * Magic-byte check for one MIME type. Returns true when the bytes are
 * consistent with the claimed type, false when they contradict it.
 * Returns null for types with no reliable magic bytes (plain text) —
 * the caller treats null as "no signal, MIME + extension decide".
 */
function magicMatches(mime: string, bytes: Buffer): boolean | null {
  switch (mime) {
    case 'application/pdf':
      return startsWith(bytes, '%PDF');
    case 'image/png':
      return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
    case 'image/gif':
      return startsWith(bytes, 'GIF87a') || startsWith(bytes, 'GIF89a');
    case 'image/webp':
      return (
        bytes.length >= 12 &&
        startsWith(bytes, 'RIFF') &&
        bytes.subarray(8, 12).toString('latin1') === 'WEBP'
      );
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      // OOXML files are ZIP archives.
      return startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint':
      // Legacy Office files are OLE compound documents.
      return startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case 'video/mp4':
    case 'video/quicktime':
      // 'ftyp' box at offset 4.
      return bytes.length >= 8 && bytes.subarray(4, 8).toString('latin1') === 'ftyp';
    case 'video/webm':
      return startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    default:
      // text/plain, text/csv, text/markdown, application/rtf: no
      // reliable magic bytes — MIME + extension is the whole check.
      return null;
  }
}

/**
 * Validate one uploaded file against its field's variant. Returns an
 * error message, or null when the file passes. Reads the bytes (for
 * the size + magic checks) only after the cheap MIME/extension
 * checks pass. Pure apart from the byte read — unit-testable.
 */
export async function validateFormUploadFile(
  variant: UploadVariant,
  file: FormUploadFile,
): Promise<string | null> {
  const config = uploadVariantConfig(variant);
  if (!file.type || !(config.mimes as readonly string[]).includes(file.type)) {
    return `Only ${config.description} — this file type is not allowed`;
  }
  const ext = fileExtensionOf(file.name);
  if (!ext) {
    return 'The file needs a filename extension';
  }
  if (!(config.extensions as readonly string[]).includes(ext)) {
    return `Only ${config.description} — .${ext} files are not allowed`;
  }
  // The extension must be the one this MIME type maps to: a file
  // called x.pdf that declares image/png (or vice versa) is rejected.
  if (MIME_TO_EXTENSION[file.type] !== ext && !(file.type === 'image/jpeg' && ext === 'jpeg')) {
    return `The file extension .${ext} does not match its type (${file.type})`;
  }
  if (!Number.isFinite(file.size) || file.size < 0) {
    return 'The file size could not be read';
  }
  if (file.size > config.maxBytes) {
    return `The file must be 5 MB or smaller`;
  }
  let bytes: Buffer;
  try {
    bytes = await readBytes(file);
  } catch {
    return 'The file could not be read';
  }
  if (bytes.byteLength > config.maxBytes) {
    return `The file must be 5 MB or smaller`;
  }
  if (bytes.byteLength === 0) {
    return 'The file is empty';
  }
  const magic = magicMatches(file.type, bytes);
  if (magic === false) {
    return `The file contents do not match its type (${file.type}) — a renamed file is not accepted`;
  }
  return null;
}

/** Re-export the service-role storage client builder (shared with application files). */
export function getFormUploadStorageClient(): SupabaseClient {
  return getApplicationStorageClient();
}

/**
 * Validate + upload one form-submission file to
 * `application-files/form-uploads/<formId>/<uuid>.<ext>`.
 * Returns the file reference stored in the submission data.
 * Validation runs before the client is built, so a bad file is a 400
 * even when the service-role key is missing. The stored extension
 * comes from the VERIFIED MIME type, never the user-supplied name.
 */
export async function uploadFormFile(
  formId: string,
  variant: UploadVariant,
  file: FormUploadFile,
  client?: SupabaseClient,
): Promise<FormFileReference> {
  const problem = await validateFormUploadFile(variant, file);
  if (problem) {
    throw new FormUploadError(problem, 400);
  }
  const ext = MIME_TO_EXTENSION[file.type] ?? fileExtensionOf(file.name);
  const bytes = await readBytes(file);
  let storage: SupabaseClient;
  try {
    storage = client ?? getApplicationStorageClient();
  } catch (e) {
    throw new FormUploadError(
      e instanceof Error ? e.message : 'File uploads are not configured yet',
      503,
    );
  }
  const path = `${FORM_UPLOADS_PREFIX}/${formId}/${randomUUID()}.${ext}`;
  let data: { path: string } | null;
  try {
    const result = await storage.storage
      .from(APPLICATION_FILES_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (result.error || !result.data) {
      throw new Error(result.error?.message ?? 'unknown error');
    }
    data = result.data;
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message.includes('Bucket not found')) {
      throw new FormUploadError(
        'File uploads are not set up yet (the application-files bucket does not exist in Supabase Storage)',
        503,
      );
    }
    throw new FormUploadError(`File upload failed: ${message || 'unknown error'}`, 500);
  }
  return { name: file.name, url: data.path, size: bytes.byteLength, mime: file.type };
}

/** Delete a previously uploaded form file by its storage path (best-effort cleanup). */
export async function deleteFormUploadFile(path: string, client?: SupabaseClient): Promise<void> {
  const storage = client ?? getApplicationStorageClient();
  const { error } = await storage.storage.from(APPLICATION_FILES_BUCKET).remove([path]);
  if (error) {
    throw new Error(`Form file delete failed: ${error.message}`);
  }
}

/**
 * Mint a short-lived signed URL for a stored form file, so an admin
 * can view/download it from the private bucket. `expiresInSeconds`
 * defaults to 1 hour. The path MUST be one this feature wrote, and
 * MUST belong to the given form — anything else is refused before
 * storage is touched, so the signed URL can never be pointed at
 * another form's (or another feature's) files.
 */
export async function createFormFileSignedUrl(
  formId: string,
  path: string,
  expiresInSeconds = 3600,
  client?: SupabaseClient,
): Promise<string> {
  if (!isFormUploadPath(path) || formIdOfUploadPath(path) !== formId) {
    throw new FormUploadError('This file does not belong to this form', 400);
  }
  let storage: SupabaseClient;
  try {
    storage = client ?? getApplicationStorageClient();
  } catch (e) {
    throw new FormUploadError(
      e instanceof Error ? e.message : 'File access is not configured yet',
      503,
    );
  }
  const { data, error } = await storage.storage
    .from(APPLICATION_FILES_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new FormUploadError(`Could not open the file: ${error?.message ?? 'unknown error'}`, 500);
  }
  return data.signedUrl;
}
