import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { deleteAmbassadorApplication, updateAmbassadorApplicationStatus } from '@/lib/db/ambassador-applications';
import { ensureAmbassadorForApplication, validateReferralCodeForAssignment } from '@/lib/db/ambassadors';
import { ensureAmbassadorCoupon } from '@/lib/db/ambassador-credits';

/** PATCH /api/admin/ambassadors/[id] — approve/reject an application (admin only). Body: { status: 'pending' | 'approved' | 'rejected', referralCode?: string } — the optional admin-chosen code at approve time (Eman, 20 Nov 2026); when omitted, a random code is generated (the backfill path). */
const patchSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
  referralCode: z.string().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('ambassadors');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return invalidBody('status is required');
  // An admin-chosen code at approve time is validated BEFORE the
  // application status changes — a bad code is a 400 with the
  // application untouched, not a silent approval with no ambassador
  // row (the best-effort catch below is only for missing tables).
  if (parsed.data.status === 'approved' && parsed.data.referralCode?.trim()) {
    const problem = await validateReferralCodeForAssignment(parsed.data.referralCode);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  const updated = await updateAmbassadorApplicationStatus(id, parsed.data.status);
  if (!updated) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  // Ambassador referral (Eman, 16 Nov 2026; redesigned 20 Nov 2026):
  // approving an application creates the ambassador + referral code
  // immediately — the code is the one the admin typed at approve time
  // (or a random one when they left it blank, the backfill path). The
  // code's Rs 200 coupon is ensured right away. Best-effort — if the
  // referral tables are not set up yet (migration not run), the
  // approval still succeeds and the backfill on the admin page
  // creates the code later.
  if (parsed.data.status === 'approved') {
    try {
      const ambassador = await ensureAmbassadorForApplication(updated, parsed.data.referralCode);
      await ensureAmbassadorCoupon(ambassador.referralCode);
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
