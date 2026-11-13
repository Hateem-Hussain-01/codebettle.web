/**
 * Batch management service.
 *
 * The logic behind /api/admin/batches/*. Admin-only. No Next.js
 * imports — unit-testable with the fake db. Every mutation writes an
 * audit entry. A batch belongs to one course; students enrol in a
 * specific batch; the certificate batch comes from the enrolment's
 * batch (batchNumber -> "BATCH-<n>").
 */
import { createBatch, deleteBatch, getBatchById, getBatchesByCourse, updateBatch } from '../db/batches';
import { getCourseById } from '../db/courses';
import { getUserById } from '../db/users';
import { logAudit } from '../db/audit';
import type { Batch, BatchStatus } from '../db/types';
import { badRequest, forbidden, notFound, type Actor, type ServiceError } from './errors';
import { hasAdminCapability, hasTeacherCapability } from '../rbac';

type Result<T> = T | ServiceError;

function requireAdmin(actor: Actor): ServiceError | null {
  return hasAdminCapability(actor) ? null : forbidden('Only admins can manage batches');
}

export interface CreateBatchServiceInput {
  courseId: string;
  batchNumber?: number;
  status?: BatchStatus;
  startDate?: string | null;
  endDate?: string | null;
  capacity?: number | null;
  instructorId?: string | null;
}

/** Create a batch for a course. batchNumber defaults to next free (max + 1). */
export async function createBatchService(
  actor: Actor,
  input: CreateBatchServiceInput,
): Promise<Result<{ batch: Batch }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  const course = await getCourseById(input.courseId);
  if (!course) return notFound('Course');
  if (input.instructorId) {
    const instructor = await getUserById(input.instructorId);
    if (!instructor) return notFound('Instructor');
    if (!hasTeacherCapability(instructor)) {
      return badRequest('The batch instructor must be a teacher account');
    }
  }
  if (input.capacity !== undefined && input.capacity !== null) {
    if (!Number.isInteger(input.capacity) || input.capacity < 1) {
      return badRequest('Capacity must be a positive whole number');
    }
  }
  if (input.startDate && input.endDate && input.startDate > input.endDate) {
    return badRequest('The batch start date must be before its end date');
  }
  const created = await createBatch({
    courseId: input.courseId,
    batchNumber: input.batchNumber,
    status: input.status,
    startDate: input.startDate,
    endDate: input.endDate,
    capacity: input.capacity,
    instructorId: input.instructorId,
  });
  if ('error' in created) return badRequest(created.error);
  await logAudit({
    actorId: actor.id,
    action: 'batch.create',
    entity: 'batch',
    entityId: created.batch.id,
    detail: `${input.courseId} Batch ${created.batch.batchNumber}`,
  });
  return { batch: created.batch };
}

export interface UpdateBatchServiceInput {
  status?: BatchStatus;
  startDate?: string | null;
  endDate?: string | null;
  capacity?: number | null;
  instructorId?: string | null;
}

/** Update a batch (status, dates, capacity, instructor). */
export async function updateBatchService(
  actor: Actor,
  batchId: string,
  input: UpdateBatchServiceInput,
): Promise<Result<{ batch: Batch }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  const existing = await getBatchById(batchId);
  if (!existing) return notFound('Batch');
  if (input.instructorId) {
    const instructor = await getUserById(input.instructorId);
    if (!instructor) return notFound('Instructor');
    if (!hasTeacherCapability(instructor)) {
      return badRequest('The batch instructor must be a teacher account');
    }
  }
  if (input.capacity !== undefined && input.capacity !== null) {
    if (!Number.isInteger(input.capacity) || input.capacity < 1) {
      return badRequest('Capacity must be a positive whole number');
    }
  }
  const startDate = input.startDate !== undefined ? input.startDate : existing.startDate;
  const endDate = input.endDate !== undefined ? input.endDate : existing.endDate;
  if (startDate && endDate && startDate > endDate) {
    return badRequest('The batch start date must be before its end date');
  }
  const updated = await updateBatch(batchId, input);
  if (!updated) return notFound('Batch');
  await logAudit({ actorId: actor.id, action: 'batch.update', entity: 'batch', entityId: batchId });
  return { batch: updated };
}

/** Delete a batch. Refused when students are enrolled in it. */
export async function deleteBatchService(
  actor: Actor,
  batchId: string,
): Promise<Result<{ success: true }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  const existing = await getBatchById(batchId);
  if (!existing) return notFound('Batch');
  const deleted = await deleteBatch(batchId);
  if ('error' in deleted) return badRequest(deleted.error);
  await logAudit({ actorId: actor.id, action: 'batch.delete', entity: 'batch', entityId: batchId });
  return { success: true };
}

/** Batches of one course, newest batch number first (admin view). */
export async function listBatchesForCourse(courseId: string): Promise<Batch[]> {
  return getBatchesByCourse(courseId);
}
