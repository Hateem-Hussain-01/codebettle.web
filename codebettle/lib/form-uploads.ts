/**
 * File-upload field configuration for the Forms Builder (GHL upgrade,
 * Worker C — file-upload field type).
 *
 * Pure, client-safe module: no server imports, so the builder, the
 * public form and the server validators all share ONE definition of
 * what each upload variant accepts. The server never trusts this
 * client-side list on its own — lib/services/form-upload.ts re-checks
 * MIME + extension + size + magic bytes on every upload.
 *
 * Variants:
 * - picture:  images only (JPG/PNG/WebP/GIF)
 * - document: PDF / Word documents only
 * - video:    MP4 / WebM / MOV only
 * - files:    a broad SAFE list (images, PDF, Office docs, plain text)
 *             — executables, scripts, HTML and archives are NOT on the
 *             list, so they are rejected by the allowlist (there is no
 *             separate denylist to keep in sync).
 *
 * Size limit: 5 MB per file for EVERY variant. The upload transport is
 * the API route (multipart/form-data through /api/forms/[slug]/submit,
 * mirroring the avatar / application-file upload routes), and Vercel
 * serverless functions cap request payloads at ~4.5 MB — a larger
 * video limit would be a lie on this transport. A bigger video limit
 * would need direct-to-storage signed uploads, which is not built
 * here.
 *
 * Stored reference shape (the ONLY thing saved in
 * FormSubmission.data[fieldId] — never file bytes):
 *   { name, url, size, mime }
 * where `url` is the PRIVATE storage path
 * (`form-uploads/<formId>/<uuid>.<ext>`) in the existing private
 * `application-files` bucket — NOT a public URL. An admin opens it
 * only through the signed-URL route
 * (GET /api/admin/forms/[id]/submissions/[submissionId]/file).
 */

export type UploadVariant = 'picture' | 'document' | 'video' | 'files';

export const UPLOAD_VARIANTS: readonly UploadVariant[] = [
  'picture',
  'document',
  'video',
  'files',
] as const;

export function isUploadVariant(value: unknown): value is UploadVariant {
  return (
    typeof value === 'string' &&
    (UPLOAD_VARIANTS as readonly string[]).includes(value)
  );
}

/** 5 MB per file, every variant (see the module header for why). */
export const MAX_FORM_UPLOAD_BYTES = 5 * 1024 * 1024;

/** MIME type -> the one extension files of that type are stored with. */
export const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'application/rtf': 'rtf',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export interface UploadVariantConfig {
  variant: UploadVariant;
  /** Label shown in the builder's variant selector. */
  label: string;
  /** Short description of what the variant accepts (builder + public form). */
  description: string;
  /** Allowed MIME types (exact match, server-enforced). */
  mimes: readonly string[];
  /** Allowed filename extensions (lowercase, no dot). */
  extensions: readonly string[];
  /** Value for the browser <input type="file" accept="..."> (UX hint only). */
  accept: string;
  maxBytes: number;
}

const PICTURE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const DOCUMENT_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
const VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
/** The broad safe list for the generic variant — no executables, no scripts, no HTML, no archives. */
const FILES_MIMES = [
  ...PICTURE_MIMES,
  ...DOCUMENT_MIMES,
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/rtf',
] as const;

function extensionsFor(mimes: readonly string[]): string[] {
  return mimes.map((m) => MIME_TO_EXTENSION[m]).filter((e): e is string => Boolean(e));
}

export const UPLOAD_VARIANT_CONFIG: Record<UploadVariant, UploadVariantConfig> = {
  picture: {
    variant: 'picture',
    label: 'Image upload',
    description: 'JPG, PNG, WebP or GIF image (max 5 MB)',
    mimes: PICTURE_MIMES,
    extensions: extensionsFor(PICTURE_MIMES),
    accept: PICTURE_MIMES.join(','),
    maxBytes: MAX_FORM_UPLOAD_BYTES,
  },
  document: {
    variant: 'document',
    label: 'Document upload',
    description: 'PDF, DOC or DOCX document (max 5 MB)',
    mimes: DOCUMENT_MIMES,
    extensions: extensionsFor(DOCUMENT_MIMES),
    accept: DOCUMENT_MIMES.join(','),
    maxBytes: MAX_FORM_UPLOAD_BYTES,
  },
  video: {
    variant: 'video',
    label: 'Video upload',
    description: 'MP4, WebM or MOV video (max 5 MB)',
    mimes: VIDEO_MIMES,
    extensions: extensionsFor(VIDEO_MIMES),
    accept: VIDEO_MIMES.join(','),
    maxBytes: MAX_FORM_UPLOAD_BYTES,
  },
  files: {
    variant: 'files',
    label: 'Files upload',
    description: 'Images, PDF, Office documents or plain text (max 5 MB)',
    mimes: FILES_MIMES,
    extensions: extensionsFor(FILES_MIMES),
    accept: FILES_MIMES.join(','),
    maxBytes: MAX_FORM_UPLOAD_BYTES,
  },
};

/** The variant a file field uses when none was stored (backwards-compatible). */
export const DEFAULT_UPLOAD_VARIANT: UploadVariant = 'files';

export function uploadVariantConfig(variant: UploadVariant | undefined): UploadVariantConfig {
  return UPLOAD_VARIANT_CONFIG[isUploadVariant(variant) ? variant : DEFAULT_UPLOAD_VARIANT];
}

/** Lowercase extension of a filename (no dot), or '' when there is none. */
export function fileExtensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Stored file reference
// ---------------------------------------------------------------------------

/**
 * What a file field's value looks like inside FormSubmission.data:
 * the original filename (display only), the private storage path,
 * the byte size and the verified MIME type. No bytes, no public URL.
 */
export interface FormFileReference {
  name: string;
  /** Private storage path, e.g. `form-uploads/<formId>/<uuid>.pdf`. */
  url: string;
  size: number;
  mime: string;
}

/** Storage paths this feature writes: form-uploads/<formId>/<uuid>.<ext>. */
export const FORM_UPLOAD_PATH_PATTERN =
  /^form-uploads\/[^/\s]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|md|rtf|mp4|webm|mov)$/;

export function isFormUploadPath(value: unknown): value is string {
  return typeof value === 'string' && FORM_UPLOAD_PATH_PATTERN.test(value);
}

/** The form id embedded in a form-upload storage path (segment 2), or null. */
export function formIdOfUploadPath(path: string): string | null {
  const parts = path.split('/');
  return parts.length === 3 && parts[0] === 'form-uploads' ? parts[1] : null;
}

/** Is this value a stored file reference (shape check only — the server re-validates it)? */
export function isFileReference(value: unknown): value is FormFileReference {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === 'string' &&
    v.name.length > 0 &&
    typeof v.url === 'string' &&
    typeof v.size === 'number' &&
    Number.isFinite(v.size) &&
    typeof v.mime === 'string' &&
    v.mime.length > 0
  );
}

/** Human-readable byte size ("4.2 MB", "820 KB", "512 B"). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes % 1024 === 0 ? 0 : 1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
