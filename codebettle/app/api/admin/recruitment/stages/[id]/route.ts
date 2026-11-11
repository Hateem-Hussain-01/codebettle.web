import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { applicationStageSchema } from '@/lib/api-schemas';
import { deleteStageService, updateStageService } from '@/lib/services/recruitment-service';

/**
 * PATCH /api/admin/recruitment/stages/[id] — rename a stage and/or
 * change its per-stage instructions. History is untouched (it keeps
 * denormalised stageName snapshots).
 * DELETE — remove a stage. History rows survive (stageId SET NULL,
 * stageName snapshot stays readable).
 * Admin only (applications area).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('applications');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = applicationStageSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Stage name is required' }, { status: 400 });
  }
  const result = await updateStageService(auth.session, id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('applications');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await deleteStageService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result);
}
