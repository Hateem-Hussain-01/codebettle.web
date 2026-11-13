import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { batchCreateSchema } from '@/lib/api-schemas';
import { getBatchesByCourse } from '@/lib/db/batches';
import { createBatchService } from '@/lib/services/batch-service';

/**
 * GET /api/admin/batches?courseId=… — batches of one course, newest batch
 * number first (admin only). Includes an enrolled count per batch.
 * POST /api/admin/batches — create a batch (admin only).
 * Business logic lives in lib/services/batch-service.ts.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminArea('courses');
  if ('error' in auth) return auth.error;
  const courseId = request.nextUrl.searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 });
  const batches = await getBatchesByCourse(courseId);
  return NextResponse.json({ batches });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('courses');
  if ('error' in auth) return auth.error;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = batchCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid batch details' }, { status: 400 });
  }
  const result = await createBatchService(auth.session, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ batch: result.batch }, { status: 201 });
}
