import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-helpers';
import { getIntegritySummary } from '@/lib/services/data-integrity-service';

/**
 * GET /api/admin/integrity — data integrity summary (admin only, read-only).
 * Returns counts + up to 10 example ids for: enrolments whose student or
 * course is soft-deleted; enrolments with amountPaid > 0 but paymentStatus
 * 'free'; certificates whose enrolment is not completed; reviews whose
 * student/course does not exist.
 */
export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const summary = await getIntegritySummary();
  return NextResponse.json(summary);
}
