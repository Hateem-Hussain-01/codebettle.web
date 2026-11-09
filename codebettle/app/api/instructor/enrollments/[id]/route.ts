import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { setCertificateEligibility } from '@/lib/services/enrollment-service';

/**
 * PATCH /api/instructor/enrollments/[id] — set certificate eligibility
 * for one enrolment (instructor only, own courses only — enforced in the
 * service). Admins use PATCH /api/admin/enrollments/[id] instead.
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

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'certificateEligible (true/false) is required' }, { status: 400 });
  }
  const { id } = await params;
  const result = await setCertificateEligibility(auth.session, id, parsed.data.certificateEligible);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ enrollment: result.enrollment });
}
