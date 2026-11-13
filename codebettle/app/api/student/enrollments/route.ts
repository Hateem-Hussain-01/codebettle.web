import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNotViewAs, invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { enrollSelfService } from '@/lib/services/enrollment-service';

/**
 * POST /api/student/enrollments — enrol yourself in a course (Phase 7).
 * Student-only. Body: { courseId: string, batchId?: string, couponCode?: string }.
 * Enrols in the requested batch when given, else the course's open batch.
 * Free courses enrol as 'free'; paid courses enrol as 'pending' — there
 * is no payment gateway, so an admin confirms the payment later (admin
 * enrolment update flips 'pending' to 'paid'). Until then the student
 * course page withholds the Zoom link, recordings and materials.
 * A coupon code is re-validated server-side and recorded when valid.
 * Already enrolled → 409. Draft/archived course → 400.
 */
const enrollSchema = z.object({
  courseId: z.string().min(1),
  batchId: z.string().min(1).optional(),
  couponCode: z.string().min(1).max(50).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const body = await readJson(request);
  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) return invalidBody('courseId is required');
  const result = await enrollSelfService(auth.session, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ enrollment: result.enrollment }, { status: 201 });
}
