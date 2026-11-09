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
import { getCertificateByCourseAndStudent } from '../db/certificates';
import { getCourseById } from '../db/courses';
import { getUserById } from '../db/users';
import { logAudit } from '../db/audit';
import { onCertificateIssued, onCourseCompleted, onEnrollmentCreated } from './notification-service';
import type { Certificate, Enrollment, EnrollmentPaymentStatus } from '../db/types';
import { badRequest, forbidden, notFound, type Actor, type ServiceError } from './errors';
import { issueCertificateWithRetry } from './certificate-service';

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
  if (course.status === 'archived') {
    return badRequest('Cannot enrol in an archived course');
  }
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
  // Notify the student (Phase 4 hook — best-effort, never throws).
  await onEnrollmentCreated(created.enrollment);
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
): Promise<Result<{ enrollment: Enrollment; certificate: Certificate | null }>> {
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
  // Auto-issue (Phase 4): a completed + eligible enrolment gets its
  // certificate now. A failure here must never fail the enrolment update.
  const certificate = await tryAutoIssueCertificate(actor, updated);
  // Notify on the transitions that matter (Phase 4 hooks — best-effort).
  if (updated.isCompleted && !existing.isCompleted) await onCourseCompleted(updated);
  if (certificate) await onCertificateIssued(certificate);
  return { enrollment: updated, certificate };
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

/**
 * Instructor-scoped certificate eligibility (Phase 3 integration).
 * An instructor may set eligibility ONLY for enrolments in courses they
 * teach (RBAC markCompletion, ownership-scoped). Admins use the admin
 * enrolment PATCH instead. There is no instructor review storage — the
 * contract deliberately has no instructor-review columns — so reviews
 * are not collected here.
 */
export async function setCertificateEligibility(
  actor: Actor,
  enrollmentId: string,
  eligible: boolean,
): Promise<Result<{ enrollment: Enrollment; certificate: Certificate | null }>> {
  if (actor.role !== 'instructor') {
    return forbidden('Only the course instructor can set certificate eligibility');
  }
  const existing = await getEnrollmentById(enrollmentId);
  if (!existing) return notFound('Enrollment');
  const course = await getCourseById(existing.courseId);
  if (!course) return notFound('Course');
  if (course.instructorId !== actor.id) {
    return forbidden('You can only set eligibility for students in your own courses');
  }
  const updated = await updateEnrollment(enrollmentId, { certificateEligible: eligible });
  if (!updated) return notFound('Enrollment');
  await logAudit({
    actorId: actor.id,
    action: 'enrollment.eligibility',
    entity: 'enrollment',
    entityId: enrollmentId,
    detail: eligible ? 'eligible' : 'not eligible',
  });
  // Auto-issue (Phase 4): an already-complete enrolment that just became
  // eligible gets its certificate now.
  const certificate = await tryAutoIssueCertificate(actor, updated);
  if (certificate) await onCertificateIssued(certificate);
  return { enrollment: updated, certificate };
}

/**
 * Certificate auto-issuance (Phase 4).
 *
 * Issues a certificate when — and only when — the enrolment is complete
 * AND certificate-eligible. Returns the newly issued certificate, or null
 * when nothing was issued (not complete, not eligible, or one already
 * exists — the existing certificate is a no-op, never an error, and null
 * here so a notification is only ever wired to a *new* issuance).
 *
 * Never throws and never fails the caller's enrolment update: a real
 * failure is logged and swallowed. No notification is sent here — the
 * notifications worker owns that; the caller returns the certificate in
 * its result so the notification can be wired in one place.
 */
async function tryAutoIssueCertificate(
  actor: Actor,
  enrollment: Enrollment,
): Promise<Certificate | null> {
  if (!enrollment.isCompleted || enrollment.certificateEligible !== true) return null;
  try {
    const existing = await getCertificateByCourseAndStudent(enrollment.courseId, enrollment.studentId);
    if (existing) return null;
    const issued = await issueCertificateWithRetry({
      studentId: enrollment.studentId,
      courseId: enrollment.courseId,
      enrollmentId: enrollment.id,
    });
    if ('error' in issued) {
      // A duplicate reported here means a certificate appeared between the
      // check above and the create (a race) — still a no-op, not an error.
      if (issued.error === 'A certificate already exists for this enrollment') return null;
      console.error(`Auto-issue failed for enrollment ${enrollment.id}: ${issued.error}`);
      return null;
    }
    await logAudit({
      actorId: actor.id,
      action: 'certificate.auto-issue',
      entity: 'certificate',
      entityId: issued.certificate.id,
      detail: issued.certificate.certificateNumber,
    });
    return issued.certificate;
  } catch (err) {
    console.error(`Auto-issue failed for enrollment ${enrollment.id}:`, err);
    return null;
  }
}
