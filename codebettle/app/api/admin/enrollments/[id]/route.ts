import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdmin, serviceError } from '@/lib/api-helpers';
import { enrollmentUpdateSchema } from '@/lib/api-schemas';
import { deleteEnrollmentService, updateEnrollmentService } from '@/lib/services/enrollment-service';

/**
 * PATCH /api/admin/enrollments/[id] — edit an enrolment (admin only).
 * Marking isCompleted true stamps completedAt with today unless one is
 * given. DELETE — soft-delete an enrolment (admin only).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = enrollmentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid enrollment details' }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const result = await updateEnrollmentService(auth.session, id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ enrollment: result.enrollment, certificate: result.certificate });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const result = await deleteEnrollmentService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true });
}
