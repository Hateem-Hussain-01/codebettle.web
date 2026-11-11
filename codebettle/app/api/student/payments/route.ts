import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { paymentSubmissionSchema } from '@/lib/api-schemas';
import { submitPaymentService } from '@/lib/services/payment-service';

/**
 * POST /api/student/payments — submit payment proof for your own
 * enrolment (Phase 1b). Student-only, own-enrolment-only, zod
 * validated. A second submission while one is still pending review
 * is a 409 (the one-pending-per-enrolment rule in
 * lib/db/payments.ts). The proof file itself is uploaded first to
 * POST /api/student/payments/upload, which returns the storage path
 * passed here as `proofPath`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = paymentSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payment details' }, { status: 400 });
  }
  const result = await submitPaymentService(auth.session, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ submission: result.submission }, { status: 201 });
}
