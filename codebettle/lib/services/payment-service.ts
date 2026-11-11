/**
 * Payment-verification service (Phase 1b/1c).
 *
 * The logic behind POST /api/student/payments and
 * GET/PATCH /api/admin/payments. No Next.js imports — unit-testable
 * with the fake db. Every review writes a distinct audit entry
 * (`payment.approve` / `payment.reject`, never a silent
 * `paymentStatus` flip) and notifies the student (best-effort, via
 * the notification service).
 *
 * RBAC: submitting is student-only and own-enrolment-only; reviewing
 * is admin-only and additionally requires the `verifyPayment`
 * capability (lib/rbac.ts). The API routes also gate on
 * requireAdminArea('enrollments'); the service re-checks the
 * capability so the rule holds even if a route is wired wrong.
 */
import { logAudit } from '../db/audit';
import { getCourseById } from '../db/courses';
import { getEnrollmentById, updateEnrollment } from '../db/enrollments';
import { getPaymentAccountById } from '../db/payment-accounts';
import {
  approvePaymentSubmission,
  createPaymentSubmission,
  getPaymentSubmissionById,
  listPaymentSubmissions,
  listPaymentSubmissionsForEnrollment,
  rejectPaymentSubmission,
} from '../db/payments';
import { can } from '../rbac';
import type { Enrollment, PaymentSubmission } from '../db/types';
import { badRequest, conflict, forbidden, notFound, type Actor, type ServiceError } from './errors';
import { onPaymentApproved, onPaymentRejected } from './notification-service';

type Result<T> = T | ServiceError;

export interface SubmitPaymentServiceInput {
  enrollmentId: string;
  paymentAccountId?: string;
  amountPkr: number;
  transactionRef: string;
  /** Storage path of the uploaded proof (e.g. `payment-proofs/<uuid>.png`). */
  proofPath?: string;
}

/**
 * A student submits payment proof for their own pending enrolment.
 * The one-pending-per-enrolment rule lives in the repository
 * (createPaymentSubmission) and surfaces here as a 409.
 */
export async function submitPaymentService(
  actor: Actor,
  input: SubmitPaymentServiceInput,
): Promise<Result<{ submission: PaymentSubmission }>> {
  if (actor.role !== 'student') {
    return forbidden('Only students can submit a payment');
  }
  const enrollment = await getEnrollmentById(input.enrollmentId);
  if (!enrollment) return notFound('Enrollment');
  if (enrollment.studentId !== actor.id) {
    return forbidden('You can only submit a payment for your own enrolment');
  }
  if (enrollment.paymentStatus !== 'pending') {
    return badRequest('This enrolment is not awaiting payment');
  }
  const course = await getCourseById(enrollment.courseId);
  if (!course) return notFound('Course');
  if (course.isFree) {
    return badRequest('This course is free — no payment is needed');
  }
  if (!Number.isInteger(input.amountPkr) || input.amountPkr <= 0) {
    return badRequest('Amount must be a positive number of rupees');
  }
  const transactionRef = input.transactionRef.trim();
  if (!transactionRef) {
    return badRequest('Transaction ID / reference is required');
  }
  if (input.paymentAccountId) {
    const account = await getPaymentAccountById(input.paymentAccountId);
    if (!account) return notFound('Payment account');
    if (!account.isActive) {
      return badRequest('This payment account is no longer active — pick another one');
    }
  }
  const created = await createPaymentSubmission({
    enrollmentId: enrollment.id,
    paymentAccountId: input.paymentAccountId,
    amountPkr: input.amountPkr,
    transactionRef,
    proofUrl: input.proofPath,
  });
  if ('error' in created) {
    // The repository's only error today is the duplicate-pending check.
    if (created.error.includes('already awaiting review')) return conflict(created.error);
    return badRequest(created.error);
  }
  return { submission: created.submission };
}

export interface ReviewPaymentServiceInput {
  decision: 'approved' | 'rejected';
  reviewNote?: string;
}

function auditDetail(
  submission: PaymentSubmission,
  actor: Actor,
  reviewNote?: string,
): string {
  const parts = [
    `enrollment=${submission.enrollmentId}`,
    `reviewedBy=${actor.id}`,
    `amount=${submission.amountPkr}`,
    `transactionRef=${submission.transactionRef}`,
    `proof=${submission.proofUrl ?? 'none'}`,
  ];
  if (reviewNote?.trim()) parts.push(`note=${reviewNote.trim()}`);
  return parts.join(' ');
}

/**
 * Validate the submitted amount against the course price. Without a
 * coupon the student must have paid exactly the course price; with a
 * coupon (discounted price unknown to the server) any positive amount
 * up to the full price is accepted — the admin still sees the amount
 * and the coupon on the review screen before approving.
 */
function amountMatchesCoursePrice(
  submission: PaymentSubmission,
  coursePrice: number,
  couponUsed: string | null | undefined,
): boolean {
  if (couponUsed) return submission.amountPkr > 0 && submission.amountPkr <= coursePrice;
  return submission.amountPkr === coursePrice;
}

/**
 * Approve or reject a pending payment submission. Only a `submitted`
 * row can be reviewed — an already-reviewed submission is a 409.
 *
 * Approve: the linked enrolment becomes paid AND amountPaid is set
 * from the submission's amountPkr (validated against the course
 * price), a distinct `payment.approve` audit entry is written, and
 * the student is notified. Reject: a `payment.reject` audit entry is
 * written, the student is notified with the reason, the enrolment is
 * untouched — and the pending block lifts, so the student may submit
 * again.
 */
export async function reviewPaymentService(
  actor: Actor,
  submissionId: string,
  input: ReviewPaymentServiceInput,
): Promise<Result<{ submission: PaymentSubmission; enrollment: Enrollment }>> {
  if (!can(actor.role, 'verifyPayment')) {
    return forbidden('Only admins can verify payments');
  }
  const submission = await getPaymentSubmissionById(submissionId);
  if (!submission) return notFound('Payment submission');
  if (submission.reviewStatus !== 'submitted') {
    return conflict('This payment submission has already been reviewed');
  }
  const enrollment = await getEnrollmentById(submission.enrollmentId);
  if (!enrollment) return notFound('Enrollment');
  const course = await getCourseById(enrollment.courseId);
  if (!course) return notFound('Course');

  if (input.decision === 'approved') {
    if (course.isFree) {
      return badRequest('This course is free — there is nothing to verify');
    }
    if (!amountMatchesCoursePrice(submission, course.price, enrollment.couponUsed)) {
      return badRequest(
        `Submitted amount (PKR ${submission.amountPkr}) does not match the course price (PKR ${course.price})`,
      );
    }
    const reviewed = await approvePaymentSubmission(submission.id, actor.id, input.reviewNote);
    if (!reviewed) return conflict('This payment submission has already been reviewed');
    const updated = await updateEnrollment(enrollment.id, {
      paymentStatus: 'paid',
      amountPaid: reviewed.amountPkr,
    });
    if (!updated) return notFound('Enrollment');
    await logAudit({
      actorId: actor.id,
      action: 'payment.approve',
      entity: 'payment-submission',
      entityId: reviewed.id,
      detail: auditDetail(reviewed, actor, input.reviewNote),
    });
    // Notify the student (best-effort, never throws).
    await onPaymentApproved(updated, reviewed, course.title);
    return { submission: reviewed, enrollment: updated };
  }

  const reviewed = await rejectPaymentSubmission(submission.id, actor.id, input.reviewNote);
  if (!reviewed) return conflict('This payment submission has already been reviewed');
  await logAudit({
    actorId: actor.id,
    action: 'payment.reject',
    entity: 'payment-submission',
    entityId: reviewed.id,
    detail: auditDetail(reviewed, actor, input.reviewNote),
  });
  await onPaymentRejected(enrollment, reviewed, course.title, input.reviewNote);
  return { submission: reviewed, enrollment };
}

/**
 * Admin review queue: pending-first (oldest pending first within the
 * pending group), then newest first. A status filter narrows to one
 * group, still newest first.
 */
export async function listPaymentSubmissionsForAdmin(
  reviewStatus?: PaymentSubmission['reviewStatus'],
): Promise<PaymentSubmission[]> {
  const all = await listPaymentSubmissions(
    reviewStatus ? { reviewStatus } : {},
  );
  if (reviewStatus) return all;
  const pending = all.filter((s) => s.reviewStatus === 'submitted');
  const rest = all.filter((s) => s.reviewStatus !== 'submitted');
  return [...pending, ...rest];
}

/**
 * The approved submission for an enrolment, if one exists — the proof
 * the admin-enrolment PATCH guard (lib/services/enrollment-service.ts)
 * requires before an enrolment may be flipped to `paid`.
 */
export async function getApprovedSubmissionForEnrollment(
  enrollmentId: string,
): Promise<PaymentSubmission | null> {
  const submissions = await listPaymentSubmissionsForEnrollment(enrollmentId);
  return submissions.find((s) => s.reviewStatus === 'approved') ?? null;
}
