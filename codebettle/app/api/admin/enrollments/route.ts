import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { enrollmentCreateSchema } from '@/lib/api-schemas';
import { listEnrollments } from '@/lib/db/enrollments';
import { createEnrollmentService } from '@/lib/services/enrollment-service';

/**
 * GET /api/admin/enrollments — paginated enrolments (admin only).
 * Query params: page, limit, studentId, courseId.
 * POST /api/admin/enrollments — create an enrolment (admin only).
 * Business logic lives in lib/services/enrollment-service.ts.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminArea('enrollments');
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const page = await listEnrollments({
    studentId: params.get('studentId') ?? undefined,
    courseId: params.get('courseId') ?? undefined,
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  return NextResponse.json({
    enrollments: page.items,
    page: page.page,
    totalPages: page.totalPages,
    total: page.total,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('enrollments');
  if ('error' in auth) return auth.error;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = enrollmentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid enrollment details' }, { status: 400 });
  }
  const result = await createEnrollmentService(auth.session, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ enrollment: result.enrollment }, { status: 201 });
}
