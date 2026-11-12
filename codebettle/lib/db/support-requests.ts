/**
 * Support-request repository (Phase 3, Prisma-backed).
 *
 * A support request is always owned by one authenticated student.
 * Every read/write is scoped (studentId in the where clause for the
 * student's own paths), so a student can only ever see or touch their
 * own rows. Admin reads are unscoped but admin-only at the route.
 * ContactMessage stays the anonymous public inbox — nothing here
 * touches it.
 */
import { getDb } from './client';
import { mapSupportRequestRow } from './mappers';
import { parsePageParams, toPage, type Page } from './pagination';
import type { SupportRequest, SupportRequestCategory, SupportRequestStatus } from './types';

export interface CreateSupportRequestInput {
  studentId: string;
  category: SupportRequestCategory;
  subject: string;
  message: string;
  courseId?: string;
  attachmentUrl?: string;
}

export async function createSupportRequest(input: CreateSupportRequestInput): Promise<SupportRequest> {
  const row = await getDb().orm.public.SupportRequest.create({
    studentId: input.studentId,
    category: input.category,
    subject: input.subject,
    message: input.message,
    courseId: input.courseId ?? null,
    status: 'new',
    attachmentUrl: input.attachmentUrl ?? null,
  });
  return mapSupportRequestRow(row);
}

/** One request, only when it belongs to this student (null otherwise). */
export async function getSupportRequestForStudent(
  studentId: string,
  id: string,
): Promise<SupportRequest | null> {
  const row = await getDb().orm.public.SupportRequest.where({ id, studentId }).first();
  if (!row) return null;
  return mapSupportRequestRow(row);
}

/** One request, admin view (no student scoping — the route is admin-only). */
export async function getSupportRequestById(id: string): Promise<SupportRequest | null> {
  const row = await getDb().orm.public.SupportRequest.where({ id }).first();
  if (!row) return null;
  return mapSupportRequestRow(row);
}

export interface ListSupportRequestsOptions {
  page?: string | string[];
  limit?: string | string[];
  status?: string;
  category?: string;
}

/** The student's own requests, newest first, paginated. */
export async function listSupportRequestsForStudent(
  studentId: string,
  opts: ListSupportRequestsOptions = {},
): Promise<Page<SupportRequest>> {
  const params = parsePageParams({ page: opts.page, limit: opts.limit });
  const query = getDb().orm.public.SupportRequest.where({ studentId });
  const total = (await query.all()).length;
  const rows = await query
    .orderBy((r) => r.createdAt.desc())
    .limit(params.limit)
    .offset(params.offset)
    .all();
  return toPage(rows.map(mapSupportRequestRow), total, params);
}

/** All requests (admin), newest first, paginated, with optional filters. */
export async function listSupportRequestsForAdmin(
  opts: ListSupportRequestsOptions = {},
): Promise<Page<SupportRequest>> {
  const params = parsePageParams({ page: opts.page, limit: opts.limit });
  let query = getDb().orm.public.SupportRequest;
  if (opts.status) query = query.where({ status: opts.status });
  if (opts.category) query = query.where({ category: opts.category });
  const total = (await query.all()).length;
  const rows = await query
    .orderBy((r) => r.createdAt.desc())
    .limit(params.limit)
    .offset(params.offset)
    .all();
  return toPage(rows.map(mapSupportRequestRow), total, params);
}

export interface UpdateSupportRequestInput {
  status?: SupportRequestStatus;
  adminReply?: string;
  /** Pass null to clear (reopening a resolved/rejected request). */
  resolvedBy?: string | null;
  resolvedAt?: Date | null;
}

/**
 * Update a request (admin). Returns the updated row, or null when it
 * does not exist. Callers set resolvedBy/resolvedAt when moving to a
 * terminal status (resolved/rejected) and clear them when reopening.
 */
export async function updateSupportRequest(
  id: string,
  input: UpdateSupportRequestInput,
): Promise<SupportRequest | null> {
  const data: Record<string, unknown> = {};
  if (input.status !== undefined) data.status = input.status;
  if (input.adminReply !== undefined) data.adminReply = input.adminReply;
  if (input.resolvedBy !== undefined) data.resolvedBy = input.resolvedBy;
  if (input.resolvedAt !== undefined) data.resolvedAt = input.resolvedAt;
  const row = await getDb().orm.public.SupportRequest.where({ id }).update(data);
  if (!row) return null;
  return getSupportRequestById(id);
}
