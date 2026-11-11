import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { applicationReviewSchema } from '@/lib/api-schemas';
import { reviewApplicationService } from '@/lib/services/application-service';
import { getApplicationDetailService } from '@/lib/services/recruitment-service';

/**
 * GET /api/admin/applications/[id] — one application with its stage
 * history, internal notes, current stage and the pipeline stages
 * (admin only). The detail view the recruitment manager reads from.
 * PATCH /api/admin/applications/[id] — approve or reject an application
 * (admin only). Only a pending application can be reviewed; re-reviewing
 * returns 400. Business logic lives in
 * lib/services/application-service.ts.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('applications');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await getApplicationDetailService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('applications');
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = applicationReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Status must be approved or rejected' }, { status: 400 });
  }
  const result = await reviewApplicationService(auth.session, id, parsed.data.status);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ application: result.application });
}
