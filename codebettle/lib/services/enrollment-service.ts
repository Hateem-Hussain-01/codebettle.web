/**
 * Enrollment management service (Phase 3).
 *
 * The logic behind /api/admin/enrollments/*. Admin-only: only admins
 * create, edit or soft-delete enrolments. No Next.js imports —
 * unit-testable with the fake db. Every mutation writes an audit entry.
 */
import {
  createEnrollment,
  getEnrollmentById,
  softDeleteEnrollment,
  updateEnrollment,
} from '../db/enrollments';
import { getCourseById } from '../db/courses';
import { getUserById } from '../db/users';
import { logAudit } from '../db/audit';
import type { Enrollment, EnrollmentPaymentStatus } from '../db/types';
import { badRequest, forbidden, notFound, type Actor, type ServiceError } from './errors';

type Result<T> = T | ServiceError;

function requireAdmin(actor: Actor): ServiceError | null {
  return actor.role === 'admin' ? null : forbidden('Only admins can manage enrollments');
}

export interface CreateEnrollmentServiceInput {
  studentId: string;
  courseId: string;
  paymentStatus: EnrollmentPaymentStatus;
  amountPaid: number;
  couponUsed?: string;
}

export async function createEnrollmentService(
  actor: Actor,
  input: CreateEnrollmentServiceInput,
): Promise<Result<{ enrollment: Enrollment }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  const student = await getUserById(input.studentId);
  if (!student) return notFound('Student');
  if (student.role !== 'student') return badRequest('Enrollments require a student account');
  const course = await getCourseById(input.courseId);
  if (!course) return notFound('Course');
  if (!Number.isInteger(input.amountPaid) || input.amountPaid < 0) {
    return badRequest('Amount paid must be a non-negative number');
  }
  const created = await createEnrollment({
    studentId: input.studentId,
    courseId: input.courseId,
    paymentStatus: input.paymentStatus,
    amountPaid: input.amountPaid,
    couponUsed: input.couponUsed,
  });
  if ('error' in created) return badRequest(created.error);
  await logAudit({
    actorId: actor.id,
    action: 'enrollment.create',
    entity: 'enrollment',
    entityId: created.enrollment.id,
    detail: `${input.studentId} -> ${input.courseId}`,
  });
  return { enrollment: created.enrollment };
}

export interface UpdateEnrollmentServiceInput {
  isCompleted?: boolean;
  completedAt?: string;
  paymentStatus?: EnrollmentPaymentStatus;
  amountPaid?: number;
  certificateEligible?: boolean;
}

export async function updateEnrollmentService(
  actor: Actor,
  enrollmentId: string,
  input: UpdateEnrollmentServiceInput,
): Promise<Result<{ enrollment: Enrollment }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  const existing = await getEnrollmentById(enrollmentId);
  if (!existing) return notFound('Enrollment');
  if (input.amountPaid !== undefined && (!Number.isInteger(input.amountPaid) || input.amountPaid < 0)) {
    return badRequest('Amount paid must be a non-negative number');
  }
  // Marking complete stamps completedAt with today unless one is given;
  // un-completing clears it.
  let completedAt: string | null | undefined;
  if (input.isCompleted === true && input.completedAt === undefined) {
    completedAt = new Date().toISOString().slice(0, 10);
  } else if (input.isCompleted === false) {
    completedAt = null;
  } else if (input.completedAt !== undefined) {
    completedAt = input.completedAt;
  }
  const updated = await updateEnrollment(enrollmentId, {
    isCompleted: input.isCompleted,
    completedAt,
    paymentStatus: input.paymentStatus,
    amountPaid: input.amountPaid,
    certificateEligible: input.certificateEligible,
  });
  if (!updated) return notFound('Enrollment');
  await logAudit({ actorId: actor.id, action: 'enrollment.update', entity: 'enrollment', entityId: enrollmentId });
  return { enrollment: updated };
}

export async function deleteEnrollmentService(
  actor: Actor,
  enrollmentId: string,
): Promise<Result<{ success: true }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  const existing = await getEnrollmentById(enrollmentId);
  if (!existing) return notFound('Enrollment');
  const removed = await softDeleteEnrollment(enrollmentId);
  if (!removed) return notFound('Enrollment');
  await logAudit({ actorId: actor.id, action: 'enrollment.delete', entity: 'enrollment', entityId: enrollmentId });
  return { success: true };
}
