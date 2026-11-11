import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { applicationStageSchema } from '@/lib/api-schemas';
import { createStageService, listStagesService } from '@/lib/services/recruitment-service';

/**
 * GET /api/admin/recruitment/stages — the pipeline stages in display
 * order (seeds the eight defaults on a fresh install).
 * POST — create a custom stage (position = end of the pipeline).
 * Admin only (applications area).
 */
export async function GET() {
  const auth = await requireAdminArea('applications');
  if ('error' in auth) return auth.error;
  const result = await listStagesService(auth.session);
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('applications');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = applicationStageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Stage name is required' }, { status: 400 });
  }
  const result = await createStageService(auth.session, {
    name: parsed.data.name,
    instructions: parsed.data.instructions ?? undefined,
  });
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result, { status: 201 });
}
