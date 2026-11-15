/**
 * Shared upload file validation — magic-byte (file signature) checks.
 *
 * Security fix (UPLOAD-01 / NEW-4): every upload helper used to trust
 * the client-supplied Content-Type (`file.type`) and nothing else. A
 * request can declare ANY type for ANY bytes, so a text file (or a
 * script, or an executable) could be stored as `image/jpeg` in a
 * public bucket. The declared MIME is attacker-controlled; the bytes
 * are the ground truth.
 *
 * Every upload path now runs through `validateUploadedFile` before the
 * storage client is built, so a bad file is a 400 even when the
 * service-role key is missing. A file must pass ALL of:
 *  1. declared MIME in the endpoint's allowlist,
 *  2. declared size AND actual byte length within the limit,
 *  3. the file is not empty,
 *  4. magic bytes matching the claimed type, where the format has
 *     reliable magic bytes (PDF, images, Office docs, MP4/WebM/MOV).
 *     This is what catches a .exe renamed to .jpg: the browser
 *     reports image/jpeg for it (MIME comes from the extension) but
 *     the bytes do not start with a JPEG signature. Plain-text types
 *     (text/plain) have no reliable magic bytes, so for those the MIME
 *     + size check is the whole defence — an executable renamed to
 *     .txt is still just text to any reader, and the stored file is
 *     never executed.
 *
 * The magic-byte table lives here (moved from lib/services/form-upload.ts,
 * which now reuses it) so every upload helper — avatars, course images,
 * blog PDFs, payment proofs, application files, support-request
 * attachments, success-story files — validates content the same way.
 *
 * Pure module (no server imports) so it is unit-testable with the
 * plain Node test runner.
 */

export interface UploadedFileLike {
  name: string;
  type: string;
  size: number;
  /** Raw bytes, or a function returning them (like File.arrayBuffer). */
  arrayBuffer: ArrayBuffer | Buffer | (() => Promise<ArrayBuffer>);
}

/** Read the raw bytes of an uploaded file (works with File and with plain buffers). */
export async function readUploadedBytes(file: UploadedFileLike): Promise<Buffer> {
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
 * the caller treats null as "no signal, MIME + size decide".
 */
export function magicBytesMatch(mime: string, bytes: Buffer): boolean | null {
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
      // text/plain and anything else: no reliable magic bytes — MIME
      // + size is the whole check.
      return null;
  }
}

/**
 * Validate one uploaded file against an allowlist + size limit.
 * Returns an error message, or null when the file passes. The
 * `typeError` / `sizeError` messages are the endpoint's own wording
 * (kept identical to the pre-fix messages so existing clients and
 * tests see the same text for MIME/size failures). Pure apart from
 * the byte read — unit-testable.
 *
 * Checks, in order (cheap first): declared MIME in the allowlist;
 * declared size within the limit; actual byte length within the limit;
 * not empty; magic bytes matching the claimed type (where the format
 * has reliable magic bytes).
 */
export function validateUploadedBytes(
  mime: string,
  declaredSize: number,
  bytes: Buffer,
  allowedTypes: readonly string[],
  maxBytes: number,
  typeError: string,
  sizeError: string,
): string | null {
  if (!mime || !allowedTypes.includes(mime)) {
    return typeError;
  }
  if (!Number.isFinite(declaredSize) || declaredSize < 0) {
    return 'The file size could not be read';
  }
  if (declaredSize > maxBytes) {
    return sizeError;
  }
  if (bytes.byteLength > maxBytes) {
    return sizeError;
  }
  if (bytes.byteLength === 0) {
    return 'The file is empty';
  }
  const magic = magicBytesMatch(mime, bytes);
  if (magic === false) {
    return `The file contents do not match its type (${mime}) — a renamed file is not accepted`;
  }
  return null;
}

/** Async convenience wrapper: reads the file's bytes, then validates them. */
export async function validateUploadedFile(
  file: UploadedFileLike,
  allowedTypes: readonly string[],
  maxBytes: number,
  typeError: string,
  sizeError: string,
): Promise<string | null> {
  let bytes: Buffer;
  try {
    bytes = await readUploadedBytes(file);
  } catch {
    return 'The file could not be read';
  }
  return validateUploadedBytes(file.type, file.size, bytes, allowedTypes, maxBytes, typeError, sizeError);
}

// ---------------------------------------------------------------------------
// Validation-error mapping (U-6).
// ---------------------------------------------------------------------------

/**
 * Messages `validateUploadedBytes` / `validateUploadedFile` return when
 * the FILE itself fails validation — the bytes are empty, unreadable,
 * or do not match the claimed type. These are client errors (HTTP
 * 400), not server errors: before this fix every upload route fell
 * through to a generic 500 ("Photo upload failed") for them, because
 * each route's catch only matched its own type/size wording.
 *
 * Upload routes check `isUploadValidationError(message)` in their
 * catch block (before the generic 500) and return the validation
 * message with status 400. The validation OUTCOME is unchanged —
 * a mismatched file is still rejected; only the status code changes.
 * Messages that are not validation failures (missing service-role
 * key, missing bucket, storage errors) are unaffected.
 */
const UPLOAD_VALIDATION_MESSAGE_MARKERS = [
  'The file contents do not match its type',
  'The file is empty',
  'The file could not be read',
  'The file size could not be read',
] as const;

export function isUploadValidationError(message: string): boolean {
  return (
    typeof message === 'string' &&
    UPLOAD_VALIDATION_MESSAGE_MARKERS.some((marker) => message.includes(marker))
  );
}

// ---------------------------------------------------------------------------
// Storage-key segments (NEW-9).
// ---------------------------------------------------------------------------

/**
 * Storage keys are object keys, not filesystem paths — but an
 * unsanitized ID segment (`pageId`, `courseId`, `formId`) still lets a
 * caller scatter objects under unexpected prefixes (e.g.
 * `pages/../../x/<uuid>.jpg`). IDs in this app are CUIDs (lowercase
 * alphanumeric) or the literal 'pending', so an allowlist of letters,
 * digits, `_` and `-` (max 128 chars) accepts every legitimate ID and
 * rejects everything else.
 */
const STORAGE_KEY_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidStorageKeySegment(value: string): boolean {
  return typeof value === 'string' && STORAGE_KEY_SEGMENT_PATTERN.test(value);
}

/** Human-readable error for a bad storage-key segment, or null when it is fine. */
export function validateStorageKeySegment(value: string, label = 'ID'): string | null {
  if (!isValidStorageKeySegment(value)) {
    return `${label} contains characters that are not allowed`;
  }
  return null;
}
