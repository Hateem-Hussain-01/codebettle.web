/**
 * Enrollment management service (Phase 3).
 *
 * The logic behind /api/admin/enrollments/*. Admin-only: only admins
 * create, edit or soft-delete enrolments. No Next.js imports —
 * unit-testable with the fake db. Every mutation writes an audit entry.
 */
import { createEnrollment, getEnrollmentById, isEnrolled, softDeleteEnrollment, updateEnrollment } from '../db/enrollments';
import { getBatchById, getOpenBatchForCourse } from '../db/batches';
import { listPaymentSubmissionsForEnrollment } from '../db/payments';
import { getCertificateByCourseAndStudent } from '../db/certificates';
import { getCourseById } from '../db/courses';
import { validateCouponForCourse } from '../db/coupons';
import { getUserById } from '../db/users';
import { isFullAdmin } from '../admin-access';
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
  /** Batch the student enrols in. When omitted, the course's open batch is used (null = no open batch, enrolment without a batch). */
  batchId?: string;
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
  // Resolve the batch: the requested one (must belong to this course
  // and be open), else the course's open batch, else no batch.
  let batchId: string | undefined;
  if (input.batchId !== undefined) {
    const batch = await getBatchById(input.batchId);
    if (!batch) return notFound('Batch');
    if (batch.courseId !== input.courseId) {
      return badRequest('This batch does not belong to the course');
    }
    if (batch.status === 'completed') {
      return badRequest('This batch has ended — enrol in the open batch instead');
    }
    batchId = batch.id;
  } else {
    const open = await getOpenBatchForCourse(input.courseId);
    batchId = open?.id;
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
  // Phase 3 (MEDIUM-B1): 'free' is only for free courses. A paid
  // course must never be granted for free through this silent flip —
  // complimentary access is a separate, audited full-admin action
  // (compEnrollmentService). Same shape as the 'paid' guard above.
  if (input.paymentStatus === 'free' && !course.isFree) {
    return badRequest(
      'A paid course cannot be granted for free here — use the complimentary enrolment action (full admin, audited) instead',
    );
  }
  // Phase 3 (MEDIUM-B2): an admin-recorded coupon is validated like
  // the student path — expiry, usage, and course applicability — and
  // stored under its canonical code. An arbitrary string is not a coupon.
  let couponUsed: string | undefined;
  if (input.couponUsed?.trim()) {
    const coupon = await validateCouponForCourse(input.couponUsed.trim(), input.courseId);
    if (!coupon) {
      return badRequest('Coupon code is invalid, expired, or does not apply to this course');
    }
    couponUsed = coupon.code;
  }
  const created = await createEnrollment({
    studentId: input.studentId,
    courseId: input.courseId,
    batchId,
    paymentStatus: input.paymentStatus,
    amountPaid: input.amountPaid,
    couponUsed,
  });
  if ('error' in created) return badRequest(created.error);
  await logAudit({
    actorId: actor.id,
    action: 'enrollment.create',
    entity: 'enrollment',
    entityId: created.enrollment.id,
    detail: `${input.studentId} -> ${input.courseId}${batchId ? ` (batch ${batchId})` : ''}`,
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
  /** Move the enrolment to another batch of the same course (null clears the batch link). */
  batchId?: string | null;
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
  /** Batch to enrol in. When omitted, the course's open batch is used. */
  batchId?: string;
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
  // Resolve the batch: the requested one (must belong to this course
  // and be open), else the course's open batch, else no batch.
  let batchId: string | undefined;
  if (input.batchId !== undefined) {
    const batch = await getBatchById(input.batchId);
    if (!batch) return notFound('Batch');
    if (batch.courseId !== input.courseId) {
      return badRequest('This batch does not belong to the course');
    }
    if (batch.status === 'completed') {
      return badRequest('This batch has ended — enrol in the open batch instead');
    }
    batchId = batch.id;
  } else {
    const open = await getOpenBatchForCourse(input.courseId);
    batchId = open?.id;
  }
  let couponUsed: string | undefined;
  const couponCode = input.couponCode?.trim();
  if (couponCode) {
    // Phase 3 (P-3 / MEDIUM-B2): the coupon must apply to THIS course
    // — a coupon meant for another course is rejected here, not just
    // checked for expiry.
    const coupon = await validateCouponForCourse(couponCode, input.courseId);
    if (!coupon) return badRequest('Coupon code is invalid, expired, or does not apply to this course');
    couponUsed = coupon.code;
  }
  const paymentStatus: EnrollmentPaymentStatus = course.isFree ? 'free' : 'pending';
  const created = await createEnrollment({
    studentId: actor.id,
    courseId: input.courseId,
    batchId,
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
    detail: `self: ${actor.id} -> ${input.courseId} (${paymentStatus})${batchId ? ` (batch ${batchId})` : ''}`,
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
  // Moving to another batch: the batch must belong to the same course
  // and not have ended.
  if (input.batchId !== undefined && input.batchId !== null) {
    const batch = await getBatchById(input.batchId);
    if (!batch) return notFound('Batch');
    if (batch.courseId !== existing.courseId) {
      return badRequest('This batch does not belong to the enrolment’s course');
    }
    if (batch.status === 'completed') {
      return badRequest('This batch has ended');
    }
  }
  // Phase 3 (MEDIUM-B1): a paid course may never be granted for free
  // through a silent paymentStatus flip — this is the exact hole
  // behind the live 'free' paid-course enrolments (Eman's own admin
  // flips, §10.3 of the Phase 2 findings). Only a transition INTO
  // 'free' is guarded: re-saving an enrolment that is already free
  // (including ones granted before this fix) is not a new grant.
  // Complimentary access is compEnrollmentService instead.
  if (input.paymentStatus === 'free' && existing.paymentStatus !== 'free') {
    const course = await getCourseById(existing.courseId);
    if (course && !course.isFree) {
      return badRequest(
        'A paid course cannot be granted for free by changing the payment status — use the complimentary enrolment action (full admin, audited) instead',
      );
    }
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
      // Phase 3 (MEDIUM-B2): the flip-to-paid amount comes from the
      // approved submission. An admin-supplied amountPaid that DIFFERS
      // is rejected outright — silently overriding the approved amount
      // hid mistakes. Omit it to use the approved amount.
      if (amountPaid !== undefined && amountPaid !== approved.amountPkr) {
        return badRequest(
          `Amount paid (PKR ${amountPaid}) does not match the approved payment (PKR ${approved.amountPkr}) — the approved amount is used`,
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
    batchId: input.batchId,
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

export interface CompEnrollmentServiceInput {
  /** Why this student gets the paid course for free — recorded in the audit log. */
  reason: string;
}

/**
 * Complimentary access (Phase 3, MEDIUM-B1) — the ONLY way to grant a
 * paid course for free, and the legitimate workflow the silent
 * pending→free flip used to serve (Eman's own comping, §10.3 of the
 * Phase 2 findings).
 *
 * Deliberately separate from updateEnrollmentService: it requires a
 * FULL admin (role `admin` with no permissions restriction — the
 * actor's record is re-read from the database, never trusted from
 * the session alone), a required reason, and writes a distinct
 * `enrollment.comp` audit entry carrying that reason, so a comp is
 * always distinguishable from a normal enrolment in the audit log.
 * Only a pending enrolment in a paid course can be comped; paid and
 * already-free enrolments are rejected, and free courses need no comp.
 */
export async function compEnrollmentService(
  actor: Actor,
  enrollmentId: string,
  input: CompEnrollmentServiceInput,
): Promise<Result<{ enrollment: Enrollment; certificate: Certificate | null }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  // Full admin only — a restricted (enrolments-area) admin must never
  // be able to comp a paid course. Re-read the actor: a session minted
  // before a permissions change must not keep the old access.
  const actorUser = await getUserById(actor.id);
  if (!actorUser || !hasAdminCapability(actorUser) || !isFullAdmin(actorUser.adminPermissions)) {
    return forbidden('Only a full admin can grant complimentary access to a paid course');
  }
  const reason = input.reason?.trim();
  if (!reason) return badRequest('A reason is required for complimentary access');
  if (reason.length > 500) return badRequest('Reason must be 500 characters or fewer');
  const existing = await getEnrollmentById(enrollmentId);
  if (!existing) return notFound('Enrollment');
  if (existing.paymentStatus !== 'pending') {
    return badRequest('Only a pending enrolment can be granted complimentary access');
  }
  const course = await getCourseById(existing.courseId);
  if (!course) return notFound('Course');
  if (course.isFree) {
    return badRequest('This course is free — no complimentary grant is needed');
  }
  const updated = await updateEnrollment(enrollmentId, {
    paymentStatus: 'free',
    amountPaid: 0,
  });
  if (!updated) return notFound('Enrollment');
  await logAudit({
    actorId: actor.id,
    action: 'enrollment.comp',
    entity: 'enrollment',
    entityId: enrollmentId,
    detail: `comp: ${existing.studentId} -> ${existing.courseId} (free) reason=${reason}`,
  });
  // Auto-issue (Phase 4): same as a normal update — a completed +
  // eligible enrolment gets its certificate now.
  const certificate = await tryAutoIssueCertificate(actor, updated);
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
  // SECURITY (NEW-1): never auto-issue a certificate for an enrolment
  // whose payment is still pending — same gate as issueCertificate.
  if (enrollment.paymentStatus !== 'paid' && enrollment.paymentStatus !== 'free') return null;
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
