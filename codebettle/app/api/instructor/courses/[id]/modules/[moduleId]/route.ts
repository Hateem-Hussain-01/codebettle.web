import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { moduleUpdateSchema } from '@/lib/api-schemas';
import { deleteModuleService, loadCourseForEditByUrlKey, updateModuleService } from '@/lib/services/course-service';

/**
 * PATCH/DELETE /api/instructor/courses/[id]/modules/[moduleId] — your own course only.
 * The [id] path param is the course's urlKey (opaque instructor-portal
 * key), never its raw id: a raw id 404s here. Resolved (and ownership
 * checked) before body validation / the delete, so a bad key never
 * reaches the service with the raw id.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> },
) {
  const auth = await requireRoles(['instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id, moduleId } = await params;

  const allowed = await loadCourseForEditByUrlKey(auth.session, id);
  if ('error' in allowed) return serviceError(allowed);
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = moduleUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid module details' }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const result = await updateModuleService(auth.session, allowed.course.id, moduleId, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ module: result.module });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> },
) {
  const auth = await requireRoles(['instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id, moduleId } = await params;

  const allowed = await loadCourseForEditByUrlKey(auth.session, id);
  if ('error' in allowed) return serviceError(allowed);
  const result = await deleteModuleService(auth.session, allowed.course.id, moduleId);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true });
}
