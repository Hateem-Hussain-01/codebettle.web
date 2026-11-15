import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireFullAdmin, serviceError } from '@/lib/api-helpers';
import { enrollmentCompSchema } from '@/lib/api-schemas';
import { compEnrollmentService } from '@/lib/services/enrollment-service';

/**
 * POST /api/admin/enrollments/[id]/comp — grant complimentary access
 * to a paid course (Phase 3, MEDIUM-B1). Full admin only, with a
 * required reason that is recorded in the `enrollment.comp` audit
 * entry. This is the ONLY way to make a paid-course enrolment free:
 * the admin enrolment create/PATCH paths reject `paymentStatus:
 * 'free'` for paid courses. Body: `{ reason: string }`. Only a
 * pending enrolment in a paid course can be comped.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFullAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = enrollmentCompSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A reason is required for complimentary access' }, { status: 400 });
  }
  const result = await compEnrollmentService(auth.session, id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ enrollment: result.enrollment, certificate: result.certificate });
}
