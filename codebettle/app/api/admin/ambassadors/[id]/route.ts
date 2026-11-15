import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { deleteAmbassadorApplication, updateAmbassadorApplicationStatus } from '@/lib/db/ambassador-applications';
import { ensureAmbassadorForApplication } from '@/lib/db/ambassadors';

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
  // Ambassador referral (Eman, 16 Nov 2026): approving an
  // application creates the ambassador + random referral code
  // immediately. Best-effort — if the referral tables are not set up
  // yet (migration not run), the approval still succeeds and the
  // backfill on the admin page creates the code later.
  if (parsed.data.status === 'approved') {
    try {
      await ensureAmbassadorForApplication(updated);
    } catch (e) {
      console.error('Failed to create ambassador record on approve', e);
    }
  }
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
