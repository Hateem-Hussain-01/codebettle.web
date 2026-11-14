import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { moduleCreateSchema } from '@/lib/api-schemas';
import { createModuleService, loadCourseForEditByUrlKey } from '@/lib/services/course-service';

/**
 * POST /api/instructor/courses/[id]/modules — add a module to your own course.
 * The [id] path param is the course's urlKey (opaque instructor-portal
 * key), never its raw id: a raw id 404s here. Resolved (and ownership
 * checked) before body validation, so a bad key never reaches the
 * service with the raw id.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;

  const allowed = await loadCourseForEditByUrlKey(auth.session, id);
  if ('error' in allowed) return serviceError(allowed);
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = moduleCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  const result = await createModuleService(auth.session, allowed.course.id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ module: result.module }, { status: 201 });
}
