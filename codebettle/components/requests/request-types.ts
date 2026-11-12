/**
 * Shared shapes + pure helpers for student support requests (Phase 3,
 * Worker C — UI only).
 *
 * The request APIs are Worker A's (app/api/student/requests,
 * app/api/admin/requests); the canonical category/status slugs and
 * labels live in lib/db/types.ts (SupportRequest*) and are re-exported
 * here so the UI can never drift from the stored values. The API
 * returns BARE SupportRequest rows — no student name/email and no
 * course title — so the admin pages enrich rows server-side (see
 * app/admin/requests/page.tsx) and the student client resolves the
 * course title from its enrolled-courses prop.
 *
 * `attachmentUrl` on a SupportRequest is a PRIVATE-bucket storage
 * path (e.g. `support-requests/<uuid>.pdf`), never a public URL.
 * Admins open it via GET /api/admin/requests/[id]/file, which mints
 * a short-lived signed URL — see request-detail-client.tsx.
 *
 * No API calls live here — only types and pure functions (unit-tested
 * in tests/phase3-worker-c-requests.test.ts). Nothing here is dummy
 * data: every list the UI shows comes from one of the endpoints above.
 */
import type { SupportRequest, SupportRequestCategory, SupportRequestStatus } from '@/lib/db/types';
import {
  SUPPORT_REQUEST_CATEGORIES,
  SUPPORT_REQUEST_CATEGORY_LABELS,
  SUPPORT_REQUEST_STATUSES,
} from '@/lib/db/types';

export type { SupportRequest, SupportRequestCategory, SupportRequestStatus };
export type RequestCategory = SupportRequestCategory;
export type RequestStatus = SupportRequestStatus;

/** Category values the API accepts, with the label shown in the UI.
 * Slugs AND labels come from the contract (lib/db/types.ts) so the UI
 * can never drift from the stored values — except 'teacher_reviews',
 * whose UI label is 'Teacher reviews/feedback' per the Phase 3 brief
 * (the contract's label map says 'Teacher reviews'). */
export const REQUEST_CATEGORIES: readonly { value: RequestCategory; label: string }[] =
  SUPPORT_REQUEST_CATEGORIES.map((value) => ({
    value,
    label: value === 'teacher_reviews' ? 'Teacher reviews/feedback' : SUPPORT_REQUEST_CATEGORY_LABELS[value],
  }));

const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: 'New',
  under_review: 'Under Review',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  rejected: 'Rejected',
};

export const REQUEST_STATUSES: readonly { value: RequestStatus; label: string }[] =
  SUPPORT_REQUEST_STATUSES.map((value) => ({ value, label: REQUEST_STATUS_LABELS[value] }));

/** Badge variant (components/ui/Badge) per status. */
export const REQUEST_STATUS_BADGE: Record<RequestStatus, 'info' | 'warning' | 'primary' | 'success' | 'danger'> = {
  new: 'info',
  under_review: 'warning',
  in_progress: 'primary',
  resolved: 'success',
  rejected: 'danger',
};

export function requestStatusLabel(status: string): string {
  return REQUEST_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function requestCategoryLabel(category: string): string {
  return REQUEST_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

/**
 * A support request as the STUDENT sees it: the bare row plus the
 * course title resolved from the student's enrolled courses.
 */
export interface StudentRequest extends SupportRequest {
  courseTitle?: string | null;
}

/**
 * A support request as the ADMIN sees it: the bare row plus the
 * student name/email and course title resolved server-side.
 */
export interface AdminRequest extends SupportRequest {
  studentName: string;
  studentEmail: string;
  courseTitle?: string | null;
}

// ---------------------------------------------------------------------------
// Attachment validation (client-side, mirrors the API contract).
// The server still enforces size/type — this only gives instant feedback.
// ---------------------------------------------------------------------------

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_ATTACHMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'] as const;

const ALLOWED_ATTACHMENT_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

export function validateRequestAttachment(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return 'Attachment must be 5 MB or smaller.';
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!(ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    return 'Attachment must be a PDF, Word document, JPG or PNG file.';
  }
  // Some browsers report an empty MIME type for local files; the
  // extension check above is the real gate, the MIME check only rejects
  // a file whose type is known AND not allowed.
  if (file.type && !ALLOWED_ATTACHMENT_MIME.has(file.type)) {
    return 'Attachment must be a PDF, Word document, JPG or PNG file.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Attachment link resolution (admin detail view).
//
// A stored `attachmentUrl` is a private-bucket storage path — it is
// NOT linkable directly. The only linkable values are a signed URL
// (http…, minted by GET /api/admin/requests/[id]/file) or an app path.
// Returns null when there is no linkable URL, so the detail view shows
// the storage path as text instead of guessing a URL.
// ---------------------------------------------------------------------------

export function resolveAttachmentLink(attachmentUrl?: string | null): string | null {
  if (!attachmentUrl) return null;
  if (attachmentUrl.startsWith('http://') || attachmentUrl.startsWith('https://')) return attachmentUrl;
  if (attachmentUrl.startsWith('/')) return attachmentUrl;
  return null;
}
