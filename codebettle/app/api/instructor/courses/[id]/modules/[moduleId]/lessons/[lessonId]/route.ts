import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { lessonUpdateSchema } from '@/lib/api-schemas';
import { deleteLessonService, loadCourseForEdit, updateLessonService } from '@/lib/services/course-service';

/**
 * PATCH/DELETE /api/instructor/courses/[id]/modules/[moduleId]/lessons/[lessonId] — your own course only.
 *
 * INST-03: the ownership check runs BEFORE body validation — an
 * instructor PATCHing a lesson in someone else's course gets 403 even
 * with an empty body, instead of a 400 ("Nothing to update").
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string; lessonId: string }> },
) {
  const auth = await requireRoles(['instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id, moduleId, lessonId } = await params;

  const allowed = await loadCourseForEdit(auth.session, id);
  if ('error' in allowed) return serviceError(allowed);
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = lessonUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid lesson details' }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const result = await updateLessonService(auth.session, id, moduleId, lessonId, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ lesson: result.lesson });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string; lessonId: string }> },
) {
  const auth = await requireRoles(['instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id, moduleId, lessonId } = await params;

  const result = await deleteLessonService(auth.session, id, moduleId, lessonId);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true });
}
