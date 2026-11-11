import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { moduleUpdateSchema } from '@/lib/api-schemas';
import { deleteModuleService, updateModuleService } from '@/lib/services/course-service';

/**
 * PATCH /api/admin/courses/[id]/modules/[moduleId] — rename / reorder a
 * module (admin only). DELETE — delete a module and its lessons (admin only).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> },
) {
  const auth = await requireAdminArea('courses');
  if ('error' in auth) return auth.error;
  const { id, moduleId } = await params;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = moduleUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid module details' }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const result = await updateModuleService(auth.session, id, moduleId, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ module: result.module });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; moduleId: string }> },
) {
  const auth = await requireAdminArea('courses');
  if ('error' in auth) return auth.error;
  const { id, moduleId } = await params;

  const result = await deleteModuleService(auth.session, id, moduleId);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true });
}
