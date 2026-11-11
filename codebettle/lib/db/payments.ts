/**
 * Payment-submission repository (Phase 0/1, Module 1).
 *
 * A student submits proof of a manual transfer (transaction ref +
 * optional proof URL) against one enrolment; an admin approves or
 * rejects it. This is deliberately separate from the Payment model:
 * Payment is gateway-shaped (provider/providerRef, status
 * paid|failed|refunded) and stays untouched for future gateway use.
 *
 * Rules enforced here:
 * - One pending (submitted) submission per enrolment at most — a
 *   second submit while one awaits review is rejected (the same
 *   check-then-create pattern as createReview / createEnrollment).
 * - Only a submitted row can move to approved/rejected (the where
 *   clause enforces it); the transition records reviewedBy,
 *   reviewedAt and the review note.
 * - Every submission carries accountSnapshot — a frozen copy of the
 *   payment account at submit time — so deleting/deactivating the
 *   account never damages history.
 */
import { getDb } from './client';
import { dateToString } from './mappers';
import { getPaymentAccountById, buildAccountSnapshot, toPaymentAccountSnapshot } from './payment-accounts';
import type {
  PaymentAccountSnapshot,
  PaymentMethod,
  PaymentSubmission,
  PaymentSubmissionRow,
  PaymentSubmissionStatus,
} from './types';

export function mapPaymentSubmissionRow(row: PaymentSubmissionRow): PaymentSubmission {
  return {
    id: row.id,
    enrollmentId: row.enrollmentId,
    paymentAccountId: row.paymentAccountId ?? undefined,
    method: row.method,
    amountPkr: row.amountPkr,
    transactionRef: row.transactionRef,
    proofUrl: row.proofUrl ?? undefined,
    accountSnapshot: toPaymentAccountSnapshot(row.accountSnapshot),
    reviewStatus: row.reviewStatus,
    submittedAt: dateToString(row.submittedAt),
    reviewedBy: row.reviewedBy ?? undefined,
    reviewedAt: row.reviewedAt ? dateToString(row.reviewedAt) : undefined,
    reviewNote: row.reviewNote ?? undefined,
    createdAt: dateToString(row.createdAt),
    updatedAt: dateToString(row.updatedAt),
  };
}

export async function getPaymentSubmissionById(id: string): Promise<PaymentSubmission | null> {
  const row = await getDb().orm.public.PaymentSubmission.where({ id }).first();
  if (!row) return null;
  return mapPaymentSubmissionRow(row);
}

/** The pending submission for an enrolment, if one awaits review. */
export async function getPendingSubmissionForEnrollment(
  enrollmentId: string,
): Promise<PaymentSubmission | null> {
  const row = await getDb()
    .orm.public.PaymentSubmission.where({ enrollmentId })
    .where((s) => s.reviewStatus.eq('submitted'))
    .first();
  if (!row) return null;
  return mapPaymentSubmissionRow(row);
}

/** All submissions awaiting review, oldest first (the review queue). */
export async function listPendingSubmissions(): Promise<PaymentSubmission[]> {
  const rows = await getDb()
    .orm.public.PaymentSubmission.where((s) => s.reviewStatus.eq('submitted'))
    .orderBy((s) => s.submittedAt.asc())
    .all();
  return rows.map(mapPaymentSubmissionRow);
}

/** Every submission for one enrolment, newest first. */
export async function listPaymentSubmissionsForEnrollment(
  enrollmentId: string,
): Promise<PaymentSubmission[]> {
  const rows = await getDb()
    .orm.public.PaymentSubmission.where({ enrollmentId })
    .orderBy((s) => s.submittedAt.desc())
    .all();
  return rows.map(mapPaymentSubmissionRow);
}

export interface ListPaymentSubmissionsOptions {
  reviewStatus?: PaymentSubmissionStatus;
}

/** All submissions (admin), optionally filtered by review status, newest first. */
export async function listPaymentSubmissions(
  opts: ListPaymentSubmissionsOptions = {},
): Promise<PaymentSubmission[]> {
  let query = getDb().orm.public.PaymentSubmission;
  if (opts.reviewStatus) query = query.where({ reviewStatus: opts.reviewStatus });
  const rows = await query.orderBy((s) => s.submittedAt.desc()).all();
  return rows.map(mapPaymentSubmissionRow);
}

export interface CreatePaymentSubmissionInput {
  enrollmentId: string;
  /** When given, the method and snapshot come from this account. */
  paymentAccountId?: string;
  /** Required when no paymentAccountId is given. */
  method?: PaymentMethod;
  amountPkr: number;
  transactionRef: string;
  proofUrl?: string;
  /** Snapshot override for submissions not tied to a stored account. */
  accountSnapshot?: PaymentAccountSnapshot;
}

/**
 * Submit payment proof for an enrolment. Rejects a second submission
 * while one is still pending review for the same enrolment.
 */
export async function createPaymentSubmission(
  input: CreatePaymentSubmissionInput,
): Promise<{ submission: PaymentSubmission } | { error: string }> {
  if (await getPendingSubmissionForEnrollment(input.enrollmentId)) {
    return { error: 'A payment submission for this enrolment is already awaiting review' };
  }

  let method = input.method;
  let snapshot = input.accountSnapshot;
  if (input.paymentAccountId) {
    const account = await getPaymentAccountById(input.paymentAccountId);
    if (!account) return { error: 'Payment account not found' };
    method = method ?? account.method;
    snapshot = buildAccountSnapshot(account);
  }
  if (!method) return { error: 'Payment method is required' };
  if (!snapshot) return { error: 'Payment account snapshot is required' };

  const row = await getDb().orm.public.PaymentSubmission.create({
    enrollmentId: input.enrollmentId,
    paymentAccountId: input.paymentAccountId ?? null,
    method,
    amountPkr: input.amountPkr,
    transactionRef: input.transactionRef,
    proofUrl: input.proofUrl ?? null,
    accountSnapshot: snapshot,
    reviewStatus: 'submitted',
  });
  return { submission: mapPaymentSubmissionRow(row) };
}

export interface ReviewPaymentSubmissionInput {
  reviewStatus: 'approved' | 'rejected';
  reviewedBy: string;
  reviewNote?: string;
}

/**
 * Approve or reject a submission. Only a pending (submitted) row can
 * be reviewed — an already-reviewed submission returns null, so it
 * cannot be reviewed twice. Records reviewedBy, reviewedAt and the
 * review note on the transition.
 */
export async function reviewPaymentSubmission(
  id: string,
  input: ReviewPaymentSubmissionInput,
): Promise<PaymentSubmission | null> {
  const row = await getDb()
    .orm.public.PaymentSubmission.where({ id })
    .where((s) => s.reviewStatus.eq('submitted'))
    .update({
      reviewStatus: input.reviewStatus,
      reviewedBy: input.reviewedBy,
      reviewedAt: new Date(),
      reviewNote: input.reviewNote ?? null,
    });
  if (!row) return null;
  return getPaymentSubmissionById(id);
}

/** Approve a pending submission. Null when not found / already reviewed. */
export async function approvePaymentSubmission(
  id: string,
  reviewedBy: string,
  reviewNote?: string,
): Promise<PaymentSubmission | null> {
  return reviewPaymentSubmission(id, { reviewStatus: 'approved', reviewedBy, reviewNote });
}

/** Reject a pending submission. Null when not found / already reviewed. */
export async function rejectPaymentSubmission(
  id: string,
  reviewedBy: string,
  reviewNote?: string,
): Promise<PaymentSubmission | null> {
  return reviewPaymentSubmission(id, { reviewStatus: 'rejected', reviewedBy, reviewNote });
}
