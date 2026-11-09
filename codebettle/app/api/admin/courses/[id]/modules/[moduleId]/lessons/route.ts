import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdmin, serviceError } from '@/lib/api-helpers';
import { lessonCreateSchema } from '@/lib/api-schemas';
import { createLessonService } from '@/lib/services/course-service';

/** POST /api/admin/courses/[id]/modules/[moduleId]/lessons — add a lesson (admin only). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> },
) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id, moduleId } = await params;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = lessonCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  const result = await createLessonService(auth.session, id, moduleId, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ lesson: result.lesson }, { status: 201 });
}
