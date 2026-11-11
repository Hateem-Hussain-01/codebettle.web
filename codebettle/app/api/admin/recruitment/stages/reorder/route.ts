import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { applicationStageReorderSchema } from '@/lib/api-schemas';
import { reorderStagesService } from '@/lib/services/recruitment-service';

/**
 * POST /api/admin/recruitment/stages/reorder — apply a new pipeline
 * order. Body: { ids: string[] } — the full stage id list in the new
 * order (positions become 1..n). Admin only (applications area).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('applications');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = applicationStageReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A list of stage ids is required' }, { status: 400 });
  }
  const result = await reorderStagesService(auth.session, parsed.data.ids);
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result);
}
