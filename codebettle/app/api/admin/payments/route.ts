import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { getCourseById } from '@/lib/db/courses';
import { getEnrollmentById } from '@/lib/db/enrollments';
import { getUserById } from '@/lib/db/users';
import type { PaymentSubmissionStatus } from '@/lib/db/types';
import { listPaymentSubmissionsForAdmin } from '@/lib/services/payment-service';

/**
 * GET /api/admin/payments — the payment-verification queue (Phase 1c).
 * Admin only, `enrollments` area (the area already covers "Enrolments,
 * payments and completion"). Query param `reviewStatus=submitted |
 * approved | rejected`; without a filter, pending submissions come
 * first (oldest first), then reviewed ones newest first. Each row is
 * enriched with the student name/email, course title/price and the
 * enrolment's coupon, so the review screen never needs a second fetch.
 * The proof itself stays a storage path — an admin mints a signed URL
 * per submission via GET /api/admin/payments/[id]/proof.
 */
const STATUSES: readonly PaymentSubmissionStatus[] = ['submitted', 'approved', 'rejected'];

export async function GET(request: NextRequest) {
  const auth = await requireAdminArea('enrollments');
  if ('error' in auth) return auth.error;
  const rawStatus = request.nextUrl.searchParams.get('reviewStatus');
  const reviewStatus =
    rawStatus && (STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as PaymentSubmissionStatus)
      : undefined;
  const submissions = await listPaymentSubmissionsForAdmin(reviewStatus);

  const enriched = [];
  for (const s of submissions) {
    const enrollment = await getEnrollmentById(s.enrollmentId);
    const student = enrollment ? await getUserById(enrollment.studentId) : null;
    const course = enrollment ? await getCourseById(enrollment.courseId) : null;
    enriched.push({
      ...s,
      studentName: student?.name ?? null,
      studentEmail: student?.email ?? null,
      courseTitle: course?.title ?? null,
      coursePrice: course?.price ?? null,
      couponUsed: enrollment?.couponUsed ?? null,
      enrollmentPaymentStatus: enrollment?.paymentStatus ?? null,
    });
  }
  return NextResponse.json({ submissions: enriched });
}
