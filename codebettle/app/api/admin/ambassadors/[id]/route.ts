import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { deleteAmbassadorApplication, updateAmbassadorApplicationStatus } from '@/lib/db/ambassador-applications';

/** PATCH /api/admin/ambassadors/[id] — approve/reject an application (admin only). Body: { status: 'pending' | 'approved' | 'rejected' }. */
const patchSchema = z.object({ status: z.enum(['pending', 'approved', 'rejected']) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('ambassadors');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return invalidBody('status is required');
  const updated = await updateAmbassadorApplicationStatus(id, parsed.data.status);
  if (!updated) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  return NextResponse.json({ application: updated });
}

/** DELETE /api/admin/ambassadors/[id] — delete an application (admin only). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('ambassadors');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const removed = await deleteAmbassadorApplication(id);
  if (!removed) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
