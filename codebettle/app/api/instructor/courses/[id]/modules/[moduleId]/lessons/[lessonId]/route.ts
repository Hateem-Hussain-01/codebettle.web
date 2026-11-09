import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { lessonUpdateSchema } from '@/lib/api-schemas';
import { deleteLessonService, updateLessonService } from '@/lib/services/course-service';

/** PATCH/DELETE /api/instructor/courses/[id]/modules/[moduleId]/lessons/[lessonId] — your own course only. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string; lessonId: string }> },
) {
  const auth = await requireRoles(['instructor']);
  if ('error' in auth) return auth.error;
  const { id, moduleId, lessonId } = await params;

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
  const { id, moduleId, lessonId } = await params;

  const result = await deleteLessonService(auth.session, id, moduleId, lessonId);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true });
}
