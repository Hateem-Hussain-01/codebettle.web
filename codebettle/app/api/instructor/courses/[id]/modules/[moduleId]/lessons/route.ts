import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { lessonCreateSchema } from '@/lib/api-schemas';
import { createLessonService } from '@/lib/services/course-service';

/** POST /api/instructor/courses/[id]/modules/[moduleId]/lessons — add a lesson to your own course. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> },
) {
  const auth = await requireRoles(['instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
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
