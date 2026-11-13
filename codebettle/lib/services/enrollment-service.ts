/**
 * Enrollment management service (Phase 3).
 *
 * The logic behind /api/admin/enrollments/*. Admin-only: only admins
 * create, edit or soft-delete enrolments. No Next.js imports —
 * unit-testable with the fake db. Every mutation writes an audit entry.
 */
import { createEnrollment, getEnrollmentById, isEnrolled, softDeleteEnrollment, updateEnrollment } from '../db/enrollments';
import { listPaymentSubmissionsForEnrollment } from '../db/payments';
import { getCertificateByCourseAndStudent } from '../db/certificates';
import { getCourseById } from '../db/courses';
import { validateCoupon } from '../db/coupons';
import { getUserById } from '../db/users';
import { logAudit } from '../db/audit';
import { onCertificateIssued, onCourseCompleted, onEnrollmentCreated, onEnrollmentCreatedForInstructor } from './notification-service';
import type { Certificate, Enrollment, EnrollmentPaymentStatus } from '../db/types';
import { badRequest, conflict, forbidden, notFound, type Actor, type ServiceError } from './errors';
import { issueCertificateWithRetry } from './certificate-service';
import { hasAdminCapability, hasTeacherCapability } from '../rbac';

type Result<T> = T | ServiceError;

function requireAdmin(actor: Actor): ServiceError | null {
  // Phase 2: admin capability is the isAdmin flag (legacy role fallback).
  return hasAdminCapability(actor) ? null : forbidden('Only admins can manage enrollments');
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
  // Phase 2 (paid-with-no-proof fix): a brand-new enrolment cannot have
  // a linked approved payment submission, so 'paid' is not creatable
  // here. Create as 'pending' and let the payment verification flow
  // approve it, or 'free' for free courses. (The PATCH path enforces
  // the same rule via the approved-submission requirement.)
  if (input.paymentStatus === 'paid') {
    return badRequest(
      'Paid enrolments must go through the payment verification flow — create as pending and approve the submitted payment instead',
    );
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
  // Notify the instructor (name only — never the fee).
  await onEnrollmentCreatedForInstructor(created.enrollment);
  return { enrollment: created.enrollment };
}

export interface UpdateEnrollmentServiceInput {
  isCompleted?: boolean;
  completedAt?: string;
  paymentStatus?: EnrollmentPaymentStatus;
  amountPaid?: number;
  certificateEligible?: boolean;
}

/**
 * Student self-enrolment (Phase 7 — the enrolment flow was dead: the
 * course page only toasted and sent everyone to the login page, and no
 * student enrolment route existed at all).
 *
 * Student-only: the actor enrols THEMSELVES (actor.id is the student —
 * there is no studentId in the input, so one student cannot enrol
 * another). The course must exist and be published (draft and archived
 * courses reject). A duplicate enrolment is a 409.
 *
 * There is no payment gateway (master prompt scope), so a paid course
 * enrols as paymentStatus 'pending' with amountPaid 0 — an admin
 * confirms the payment later via the admin enrolment update, which
 * flips it to 'paid'. A free course enrols as 'free'. Until payment is
 * confirmed the student course page shows the enrolment as pending and
 * withholds the Zoom link, recordings and materials.
 *
 * A coupon code is re-validated server-side (the client-side check is
 * display-only) and recorded as couponUsed when valid; it does not
 * change amountPaid here — the amount is settled when the admin
 * confirms payment.
 */
export interface EnrollSelfServiceInput {
  courseId: string;
  couponCode?: string;
}

export async function enrollSelfService(
  actor: Actor,
  input: EnrollSelfServiceInput,
): Promise<Result<{ enrollment: Enrollment }>> {
  if (actor.role !== 'student') {
    return forbidden('Only students can enrol in a course');
  }
  const course = await getCourseById(input.courseId);
  if (!course) return notFound('Course');
  if (course.status !== 'published') {
    return badRequest('This course is not open for enrolment');
  }
  if (await isEnrolled(actor.id, input.courseId)) {
    return conflict('You are already enrolled in this course');
  }
  let couponUsed: string | undefined;
  const couponCode = input.couponCode?.trim();
  if (couponCode) {
    const coupon = await validateCoupon(couponCode);
    if (!coupon) return badRequest('Coupon code is invalid or expired');
    couponUsed = coupon.code;
  }
  const paymentStatus: EnrollmentPaymentStatus = course.isFree ? 'free' : 'pending';
  const created = await createEnrollment({
    studentId: actor.id,
    courseId: input.courseId,
    paymentStatus,
    amountPaid: 0,
    couponUsed,
  });
  if ('error' in created) return conflict('You are already enrolled in this course');
  await logAudit({
    actorId: actor.id,
    action: 'enrollment.create',
    entity: 'enrollment',
    entityId: created.enrollment.id,
    detail: `self: ${actor.id} -> ${input.courseId} (${paymentStatus})`,
  });
  // Notify the student (Phase 4 hook — best-effort, never throws).
  await onEnrollmentCreated(created.enrollment);
  // Notify the instructor (name only — never the fee).
  await onEnrollmentCreatedForInstructor(created.enrollment);
  return { enrollment: created.enrollment };
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
  // Phase 1c gap fix: an enrolment for a PAID course may only be flipped
  // to `paid` when a linked PaymentSubmission has been approved for it —
  // flipping it with amountPaid=0 and no proof is no longer possible.
  // Free courses are unaffected, and an enrolment that is already paid
  // stays editable (this guards the transition INTO paid, not re-saves).
  // When no amount is given, the approved submission's amount is used.
  let amountPaid = input.amountPaid;
  if (input.paymentStatus === 'paid' && existing.paymentStatus !== 'paid') {
    const course = await getCourseById(existing.courseId);
    if (course && !course.isFree) {
      const approved = (await listPaymentSubmissionsForEnrollment(enrollmentId)).find(
        (s) => s.reviewStatus === 'approved',
      );
      if (!approved) {
        return badRequest(
          'Cannot mark this enrolment as paid without an approved payment submission — verify the student’s payment first',
        );
      }
      if (amountPaid === undefined) amountPaid = approved.amountPkr;
    }
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
    amountPaid,
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
  if (!hasTeacherCapability(actor)) {
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
