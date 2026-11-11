import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { courseUpdateSchema } from '@/lib/api-schemas';
import { deleteCourseService, updateCourseService } from '@/lib/services/course-service';

/**
 * PATCH /api/admin/courses/[id] — edit a course (admin only). Any editable
 * field, including status (draft/published/archived) and instructorId.
 * DELETE — soft-delete a course (admin only).
 * Business logic lives in lib/services/course-service.ts.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('courses');
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = courseUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid course details' }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const result = await updateCourseService(auth.session, id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ course: result.course });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('courses');
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const result = await deleteCourseService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true });
}
