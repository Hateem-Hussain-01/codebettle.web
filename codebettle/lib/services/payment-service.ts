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
import { expectedDiscountedPrice, validateCouponForCourse } from '../db/coupons';
import { getEnrollmentById, updateEnrollment } from '../db/enrollments';
import { getPaymentAccountById } from '../db/payment-accounts';
import {
  approvePaymentSubmission,
  createPaymentSubmission,
  getPaymentSubmissionById,
  listPaymentSubmissions,
  listPaymentSubmissionsByProofUrl,
  listPaymentSubmissionsByTransactionRef,
  listPaymentSubmissionsForEnrollment,
  rejectPaymentSubmission,
} from '../db/payments';
import { getPaymentProofStorageClient, PAYMENT_PROOFS_BUCKET } from './payment-proof-storage';
import { maybeAwardTeamCreditsForEnrollment } from '../db/team-credits';
import type { SupabaseClient } from '@supabase/supabase-js';
import { can } from '../rbac';
import type { Course, Enrollment, PaymentSubmission } from '../db/types';
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
  /** Test seam: inject a mock storage client instead of the real one. */
  storageClient?: SupabaseClient;
}

/**
 * The exact amount a student must pay for an enrolment (Phase 3,
 * P-3 / MEDIUM-B2). Without a coupon it is the course price; with a
 * coupon the server computes the discounted price from the coupon
 * record (type/value, expiry, usage, course applicability) — the
 * submitted amount must equal this, exactly, at both submit time and
 * approval time. A coupon that is no longer valid has no expected
 * amount, so the payment cannot proceed at all.
 */
async function expectedAmountForEnrollment(
  couponUsed: string | null | undefined,
  course: Course,
): Promise<{ expected: number } | { error: string }> {
  if (!couponUsed) return { expected: course.price };
  const coupon = await validateCouponForCourse(couponUsed, course.id);
  if (!coupon) {
    return {
      error:
        'The coupon on this enrolment is no longer valid (expired, fully used, deactivated, or not for this course) — ask an admin to update the enrolment before paying',
    };
  }
  return { expected: expectedDiscountedPrice(course.price, coupon) };
}

/**
 * Is this a storage path the payment-proof upload route itself could
 * have returned? Only paths matching this shape are ever accepted as
 * a pre-uploaded proof — a student can never point a submission at
 * another bucket, another file, or an arbitrary string (Phase 3,
 * U-4). Same shape family as isSupportRequestAttachmentPath /
 * isFormUploadPath / isApplicationFilePath.
 *
 * Deliberately a storage-key segment, not UUID-only: the upload route
 * mints `<uuid>.<ext>`, but older clients/tests use short segments
 * (e.g. `payment-proofs/abc.png`) — the segment rule still rejects
 * traversal (`..`), slashes, other buckets, and URLs.
 */
export const PAYMENT_PROOF_PATH_PATTERN =
  /^payment-proofs\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.(png|jpg|jpeg|webp|pdf)$/;

export function isPaymentProofPath(path: string): boolean {
  return PAYMENT_PROOF_PATH_PATTERN.test(path);
}

/**
 * Does this proof path exist in the `payment-proofs` bucket
 * (Phase 3, U-4)? Same list-then-match pattern as
 * verifySuccessStoryFile: list the `payment-proofs` FOLDER narrowed
 * by the file name, then match exactly.
 *
 * The folder matters (Phase 4 regression): uploadPaymentProof stores
 * objects at key `payment-proofs/<uuid>.png` — inside a folder of
 * that name in the bucket — so listing the bucket ROOT returns only
 * the folder entry and every real proof reads as missing. List the
 * folder, not the root.
 *
 * Returns 'unavailable' when no storage client can be built — i.e.
 * the service-role key is not configured, in which case the upload
 * route itself 503s and no legitimate proof path can exist. The
 * caller then falls back to the shape + reuse checks and logs a
 * warning; the admin proof viewer cannot mint a signed URL without
 * the same key either, so a forged path still cannot be "verified"
 * by viewing. In every deployment where proofs can actually be
 * uploaded, the client builds and existence is enforced.
 */
async function checkPaymentProofExists(
  proofPath: string,
  storageClient?: SupabaseClient,
): Promise<'ok' | 'missing' | 'unavailable'> {
  let storage: SupabaseClient;
  try {
    storage = storageClient ?? getPaymentProofStorageClient();
  } catch {
    console.warn(
      '[payment] SUPABASE_SERVICE_ROLE_KEY is not set — skipping payment-proof existence check for submit; shape and reuse checks still apply',
    );
    return 'unavailable';
  }
  const fileName = proofPath.slice('payment-proofs/'.length);
  const { data, error } = await storage.storage
    .from(PAYMENT_PROOFS_BUCKET)
    .list('payment-proofs', { limit: 1, search: fileName });
  if (error || !data) return 'missing';
  return data.some((f) => f.name === fileName) ? 'ok' : 'missing';
}

/**
 * A student submits payment proof for their own pending enrolment.
 * The one-pending-per-enrolment rule lives in the repository
 * (createPaymentSubmission) and surfaces here as a 409.
 *
 * Phase 3 checks, in order: the amount must equal the server-computed
 * expected amount (course price, or the coupon's discounted price —
 * P-3); the transaction reference must never have been used by any
 * other submission (P-2); and a proof path must match the expected
 * shape, exist in the payment-proofs bucket, and not already be
 * attached to another enrolment's submission (U-4).
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
  // P-2: one transaction reference pays for one enrolment, ever. Any
  // other submission already carrying this ref — any enrolment, any
  // review status — blocks the submit. (The database unique index is
  // the backstop for the concurrent-submit race.)
  const refReuse = await listPaymentSubmissionsByTransactionRef(transactionRef);
  if (refReuse.length > 0) {
    return conflict('This transaction reference has already been used for another payment submission');
  }
  // P-3: the amount must equal the server-computed expected amount —
  // exact match, no "any amount up to the price" with a coupon.
  const expected = await expectedAmountForEnrollment(enrollment.couponUsed, course);
  if ('error' in expected) return badRequest(expected.error);
  if (expected.expected === 0) {
    return badRequest(
      'This coupon covers the full course price — no payment is needed. Ask an admin to confirm the enrolment instead of submitting a payment',
    );
  }
  if (input.amountPkr !== expected.expected) {
    return badRequest(
      `Submitted amount (PKR ${input.amountPkr}) does not match the amount due (PKR ${expected.expected})`,
    );
  }
  // U-4: a proof path must be a real uploaded payment proof.
  if (input.proofPath !== undefined) {
    if (!isPaymentProofPath(input.proofPath)) {
      return badRequest('Invalid payment proof path');
    }
    const proofReuse = await listPaymentSubmissionsByProofUrl(input.proofPath, enrollment.id);
    if (proofReuse.length > 0) {
      return badRequest('This payment proof has already been used for another enrolment');
    }
    const exists = await checkPaymentProofExists(input.proofPath, input.storageClient);
    if (exists === 'missing') {
      return badRequest('Payment proof could not be found — upload it again from the payment page');
    }
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
    // The repository's errors today are the duplicate-pending check
    // and the duplicate transaction-ref check.
    if (created.error.includes('already awaiting review')) return conflict(created.error);
    if (created.error.includes('already been used')) return conflict(created.error);
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
 * Validate the submitted amount against the course price (Phase 3,
 * P-3 / MEDIUM-B2). The coupon is re-validated at approval time —
 * expiry, usage, deactivation, and course applicability — and the
 * server computes the expected discounted price from the coupon
 * record. Without a coupon the student must have paid exactly the
 * course price; with a coupon exactly the discounted price. The old
 * "any positive amount up to the price with a coupon" rule is gone.
 */
async function amountMatchesCoursePrice(
  submission: PaymentSubmission,
  course: Course,
  couponUsed: string | null | undefined,
): Promise<{ ok: true } | { error: string }> {
  const expected = await expectedAmountForEnrollment(couponUsed, course);
  if ('error' in expected) return { error: expected.error };
  if (submission.amountPkr !== expected.expected) {
    return {
      error: `Submitted amount (PKR ${submission.amountPkr}) does not match the amount due (PKR ${expected.expected})`,
    };
  }
  return { ok: true };
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
 *
 * LOW-B2 (approval atomicity): the approve step and the enrolment
 * flip are two separate repository calls — the Prisma client does
 * offer `db.transaction()`, but no repository function takes a
 * transaction handle (and the flip lives in lib/db/enrollments.ts,
 * outside this phase's file scope), and the in-memory fake db used
 * by tests has no transaction support. So a true transaction is not
 * feasible in this PR. The ordering is deliberate and safe:
 * approve FIRST, then flip. If the flip fails, the submission stays
 * approved (never the reverse — a paid enrolment with no approved
 * payment), the admin gets a 500 naming the recovery, and the
 * enrolment can be flipped afterwards via the admin enrolment PATCH,
 * which accepts a flip once an approved submission exists. The
 * double-approve race is still closed: the approve itself is a
 * conditional UPDATE ... WHERE reviewStatus = 'submitted'.
 */
export async function reviewPaymentService(
  actor: Actor,
  submissionId: string,
  input: ReviewPaymentServiceInput,
): Promise<Result<{ submission: PaymentSubmission; enrollment: Enrollment }>> {
  if (!can(actor, 'verifyPayment')) {
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
    // P-2: this ref must not collide with any other submission — a
    // second enrolment paid with the same transaction can never be
    // approved, even if it slipped past the submit-time check.
    const refCollision = await listPaymentSubmissionsByTransactionRef(
      submission.transactionRef,
      submission.id,
    );
    if (refCollision.length > 0) {
      return conflict(
        'This transaction reference was already used for another payment submission — it cannot be approved twice',
      );
    }
    // P-3: re-validate the coupon and the amount at approval time.
    const amountCheck = await amountMatchesCoursePrice(submission, course, enrollment.couponUsed);
    if ('error' in amountCheck) {
      return badRequest(amountCheck.error);
    }
    const reviewed = await approvePaymentSubmission(submission.id, actor.id, input.reviewNote);
    if (!reviewed) return conflict('This payment submission has already been reviewed');
    const updated = await updateEnrollment(enrollment.id, {
      paymentStatus: 'paid',
      amountPaid: reviewed.amountPkr,
    });
    if (!updated) {
      // LOW-B2 residual: the submission is approved but the enrolment
      // is still pending. Never silently return 404 here — the payment
      // IS recorded, and the admin recovers by flipping the enrolment
      // via the admin enrolment PATCH (an approved submission exists).
      console.error(
        `[payment] Approved submission ${reviewed.id} but enrolment ${enrollment.id} could not be flipped to paid — admin must flip it via PATCH /api/admin/enrollments/${enrollment.id}`,
      );
      return {
        error:
          'Payment approved, but the enrolment could not be updated to paid. The approved payment is recorded — flip the enrolment to paid from the admin enrolments page (it now has an approved payment).',
        status: 500,
      };
    }
    await logAudit({
      actorId: actor.id,
      action: 'payment.approve',
      entity: 'payment-submission',
      entityId: reviewed.id,
      detail: auditDetail(reviewed, actor, input.reviewNote),
    });
    // Notify the student (best-effort, never throws).
    await onPaymentApproved(updated, reviewed, course.title);
    // Team credits (PR B): the enrollment just became paid — award
    // when the admin setting says credits are earned on approved
    // payment. Best-effort, never throws (see the function doc).
    await maybeAwardTeamCreditsForEnrollment(updated.id, 'payment');
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
