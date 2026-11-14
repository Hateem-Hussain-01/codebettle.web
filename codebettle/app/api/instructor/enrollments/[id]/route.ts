import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNotViewAs, invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { getCourseById } from '@/lib/db/courses';
import { getEnrollmentById } from '@/lib/db/enrollments';
import { setCertificateEligibility } from '@/lib/services/enrollment-service';

/**
 * PATCH /api/instructor/enrollments/[id] — set certificate eligibility
 * for one enrolment (instructor only, own courses only — enforced in the
 * service). Admins use PATCH /api/admin/enrollments/[id] instead.
 *
 * INST-03: the ownership check runs BEFORE body validation — the
 * enrolment + its course are loaded first, so a caller who does not own
 * the course gets 403 even with an invalid body (the service re-checks
 * after validation).
 */
const patchSchema = z.object({
  certificateEligible: z.boolean(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;

  const enrollment = await getEnrollmentById(id);
  if (!enrollment) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  const course = await getCourseById(enrollment.courseId);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  if (course.instructorId !== auth.session.id) {
    return NextResponse.json({ error: 'You can only set eligibility for students in your own courses' }, { status: 403 });
  }

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'certificateEligible (true/false) is required' }, { status: 400 });
  }
  const result = await setCertificateEligibility(auth.session, id, parsed.data.certificateEligible);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ enrollment: result.enrollment, certificate: result.certificate });
}
