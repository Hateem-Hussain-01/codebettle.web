import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { paymentReviewSchema } from '@/lib/api-schemas';
import { reviewPaymentService } from '@/lib/services/payment-service';

/**
 * PATCH /api/admin/payments/[id] — approve or reject a payment
 * submission (Phase 1c). Admin only, `enrollments` area, and the
 * service enforces the `verifyPayment` RBAC capability. Body:
 * `{ decision: 'approved' | 'rejected', reviewNote?: string }`.
 * Approve flips the linked enrolment to paid with amountPaid from
 * the submission (validated against the course price) and writes a
 * `payment.approve` audit entry; reject writes `payment.reject`,
 * notifies the student with the reason, and lifts the pending block
 * so the student can submit again. Reviewing an already-reviewed
 * submission is a 409.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('enrollments');
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = paymentReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid review — decision must be approved or rejected' }, { status: 400 });
  }
  const result = await reviewPaymentService(auth.session, id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ submission: result.submission, enrollment: result.enrollment });
}
