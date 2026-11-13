import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { batchUpdateSchema } from '@/lib/api-schemas';
import { getBatchById } from '@/lib/db/batches';
import { deleteBatchService, updateBatchService } from '@/lib/services/batch-service';

/**
 * GET /api/admin/batches/[id] — one batch (admin only).
 * PATCH /api/admin/batches/[id] — status, dates, capacity, instructor.
 * DELETE — delete a batch (admin only; refused when students are enrolled).
 * Business logic lives in lib/services/batch-service.ts.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('courses');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const batch = await getBatchById(id);
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  return NextResponse.json({ batch });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('courses');
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = batchUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid batch details' }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const result = await updateBatchService(auth.session, id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ batch: result.batch });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('courses');
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const result = await deleteBatchService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true });
}
