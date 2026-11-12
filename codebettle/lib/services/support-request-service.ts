/**
 * Support-request service (Phase 3, Module 7).
 *
 * Student files a request (own only — studentId always comes from the
 * session, never the body); an admin triages it. No Next.js imports —
 * unit-testable with the fake db. Both paths write an audit entry and
 * fire the notification hooks best-effort (a notification failure
 * never blocks the request itself).
 *
 * Attachments reuse the PRIVATE `application-files` bucket (the same
 * bucket as instructor-application CVs/demos — no new bucket is
 * created). What gets stored on the SupportRequest is the storage PATH
 * (e.g. `support-requests/<uuid>.pdf`), never a public URL; an admin
 * mints a short-lived signed URL for it through
 * createSupportRequestFileSignedUrl (see
 * app/api/admin/requests/[id]/file/route.ts).
 */
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSupportRequest,
  getSupportRequestById,
  updateSupportRequest,
} from '../db/support-requests';
import { isEnrolled } from '../db/enrollments';
import { getUserById } from '../db/users';
import { logAudit } from '../db/audit';
import {
  onSupportRequestCreated,
  onSupportRequestStatusChanged,
} from './notification-service';
import {
  APPLICATION_FILES_BUCKET,
  getApplicationStorageClient,
  createApplicationFileSignedUrl,
  type ApplicationFile,
} from './application-storage';
import {
  SUPPORT_REQUEST_CATEGORIES,
  SUPPORT_REQUEST_STATUSES,
  SUPPORT_REQUEST_TERMINAL_STATUSES,
  type SupportRequest,
  type SupportRequestCategory,
  type SupportRequestStatus,
} from '../db/types';
import { badRequest, forbidden, notFound, type Actor, type ServiceError } from './errors';

type Result<T> = T | ServiceError;

export const MAX_SUPPORT_REQUEST_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_SUPPORT_REQUEST_ATTACHMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
] as const;

const ATTACHMENT_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export function isSupportRequestCategory(value: unknown): value is SupportRequestCategory {
  return (SUPPORT_REQUEST_CATEGORIES as readonly string[]).includes(value as string);
}

export function isSupportRequestStatus(value: unknown): value is SupportRequestStatus {
  return (SUPPORT_REQUEST_STATUSES as readonly string[]).includes(value as string);
}

async function readBytes(file: ApplicationFile): Promise<Buffer> {
  const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file.arrayBuffer;
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
}

/**
 * Validate + upload one support-request attachment to
 * `application-files/support-requests/<uuid>.<ext>`. Returns the
 * storage path. Validation runs before the client is built, so a bad
 * file is a 400 even when the service-role key is missing. A missing
 * key throws naming the env var (the route maps that to 503).
 */
export async function uploadSupportRequestAttachment(
  file: ApplicationFile,
  client?: SupabaseClient,
): Promise<{ path: string }> {
  if (!ALLOWED_SUPPORT_REQUEST_ATTACHMENT_TYPES.includes(file.type as (typeof ALLOWED_SUPPORT_REQUEST_ATTACHMENT_TYPES)[number])) {
    throw new Error('Only PDF, DOC, DOCX, JPG or PNG files are allowed for the attachment');
  }
  if (file.size > MAX_SUPPORT_REQUEST_ATTACHMENT_BYTES) {
    throw new Error('Attachment must be 5 MB or smaller');
  }
  const body = await readBytes(file);
  if (body.byteLength > MAX_SUPPORT_REQUEST_ATTACHMENT_BYTES) {
    throw new Error('Attachment must be 5 MB or smaller');
  }
  const storage = client ?? getApplicationStorageClient();
  const path = `support-requests/${randomUUID()}.${ATTACHMENT_EXTENSIONS[file.type]}`;
  const { data, error } = await storage.storage
    .from(APPLICATION_FILES_BUCKET)
    .upload(path, body, { contentType: file.type, upsert: false });
  if (error || !data) {
    throw new Error(`Support-request attachment upload failed: ${error?.message ?? 'unknown error'}`);
  }
  return { path: data.path };
}

/** Is this a storage path the upload route itself returned? Only paths
 * matching this shape are ever accepted as a pre-uploaded attachment —
 * a student can never point a request at another bucket path. */
const SUPPORT_REQUEST_ATTACHMENT_PATH_PATTERN =
  /^support-requests\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|doc|docx|jpg|png)$/;

export function isSupportRequestAttachmentPath(path: string): boolean {
  return SUPPORT_REQUEST_ATTACHMENT_PATH_PATTERN.test(path);
}
export async function createSupportRequestFileSignedUrl(
  path: string,
  expiresInSeconds = 3600,
  client?: SupabaseClient,
): Promise<string> {
  return createApplicationFileSignedUrl(path, expiresInSeconds, client);
}

export interface CreateSupportRequestInput {
  category: string;
  subject: string;
  message: string;
  courseId?: string;
  /** Optional attachment file (validated + uploaded by this service). */
  attachment?: ApplicationFile;
  /**
   * Optional path of an attachment already uploaded through
   * POST /api/student/requests/upload. Must match the strict
   * support-requests/<uuid>.<ext> shape (see
   * isSupportRequestAttachmentPath) — never an arbitrary path.
   * Mutually exclusive with `attachment`.
   */
  attachmentPath?: string;
  /** Test seam: inject a mock storage client instead of the real one. */
  storageClient?: SupabaseClient;
}

/** Student files a support request. studentId always comes from the session. */
export async function createSupportRequestService(
  actor: Actor,
  input: CreateSupportRequestInput,
): Promise<Result<{ request: SupportRequest }>> {
  if (actor.role !== 'student') return forbidden('Only students can file a support request');
  if (!isSupportRequestCategory(input.category)) {
    return badRequest('A valid category is required');
  }
  const subject = input.subject.trim();
  if (!subject) return badRequest('Subject is required');
  if (subject.length > 200) return badRequest('Subject must be 200 characters or fewer');
  const message = input.message.trim();
  if (!message) return badRequest('Message is required');
  if (message.length > 5000) return badRequest('Message must be 5000 characters or fewer');
  const courseId = input.courseId?.trim() || undefined;
  if (courseId && !(await isEnrolled(actor.id, courseId))) {
    return badRequest('You can only attach a request to a course you are enrolled in');
  }

  let attachmentUrl: string | undefined;
  if (input.attachment && input.attachmentPath) {
    return badRequest('Attach either a file or a previously uploaded attachment, not both');
  }
  if (input.attachmentPath) {
    if (!isSupportRequestAttachmentPath(input.attachmentPath)) {
      return badRequest('Invalid attachment path');
    }
    attachmentUrl = input.attachmentPath;
  }
  if (input.attachment) {
    try {
      const uploaded = await uploadSupportRequestAttachment(input.attachment, input.storageClient);
      attachmentUrl = uploaded.path;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Attachment upload failed';
      if (
        messageText.includes('SUPABASE_SERVICE_ROLE_KEY') ||
        messageText.includes('Supabase URL is not set')
      ) {
        return { error: 'Attachment uploads are not configured yet', status: 503 };
      }
      return badRequest(messageText);
    }
  }

  const request = await createSupportRequest({
    studentId: actor.id,
    category: input.category,
    subject,
    message,
    courseId,
    attachmentUrl,
  });
  await logAudit({
    actorId: actor.id,
    action: 'support_request.create',
    entity: 'SupportRequest',
    entityId: request.id,
    detail: `${input.category}: ${subject}`,
  });
  try {
    const student = await getUserById(actor.id);
    await onSupportRequestCreated(request, student?.name);
  } catch {
    // Best-effort — the request stands.
  }
  return { request };
}

export interface UpdateSupportRequestInput {
  status?: string;
  adminReply?: string;
}

/**
 * Admin triages a request. Moving to a terminal status (resolved /
 * rejected) stamps resolvedBy/resolvedAt; moving back out of one
 * clears them. A status change — or a new admin reply — notifies the
 * student (best-effort). The admin's own reply is stored verbatim.
 */
export async function updateSupportRequestService(
  actor: Actor,
  id: string,
  input: UpdateSupportRequestInput,
): Promise<Result<{ request: SupportRequest }>> {
  if (!actor.isAdmin && actor.role !== 'admin') {
    return forbidden('Admin access required');
  }
  const existing = await getSupportRequestById(id);
  if (!existing) return notFound('Support request');
  const status = input.status?.trim() || undefined;
  if (status !== undefined && !isSupportRequestStatus(status)) {
    return badRequest('Invalid status');
  }
  const adminReply = input.adminReply?.trim();
  if (adminReply !== undefined && adminReply.length > 5000) {
    return badRequest('Reply must be 5000 characters or fewer');
  }
  const statusChanged = status !== undefined && status !== existing.status;
  const replyChanged = adminReply !== undefined && adminReply !== (existing.adminReply ?? '');

  const isTerminal = status !== undefined
    ? (SUPPORT_REQUEST_TERMINAL_STATUSES as readonly string[]).includes(status)
    : (SUPPORT_REQUEST_TERMINAL_STATUSES as readonly string[]).includes(existing.status);
  const updated = await updateSupportRequest(id, {
    ...(status !== undefined ? { status: status as SupportRequestStatus } : {}),
    ...(adminReply !== undefined ? { adminReply } : {}),
    // Terminal: stamp resolver + time. Reopening: clear them.
    ...(status !== undefined
      ? isTerminal
        ? { resolvedBy: actor.id, resolvedAt: new Date() }
        : { resolvedBy: null, resolvedAt: null }
      : {}),
  });
  if (!updated) return notFound('Support request');
  await logAudit({
    actorId: actor.id,
    action: 'support_request.update',
    entity: 'SupportRequest',
    entityId: id,
    detail: statusChanged ? `status ${existing.status} -> ${status}` : 'reply updated',
  });
  if (statusChanged || replyChanged) {
    try {
      await onSupportRequestStatusChanged(updated);
    } catch {
      // Best-effort — the update stands.
    }
  }
  return { request: updated };
}
