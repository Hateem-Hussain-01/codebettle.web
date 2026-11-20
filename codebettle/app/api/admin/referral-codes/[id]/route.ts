import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import {
  getAmbassadorById,
  getAmbassadorStats,
  updateAmbassadorCode,
  updateAmbassadorStatus,
} from '@/lib/db/ambassadors';
import {
  countAmbassadorDiscounts,
  deactivateAmbassadorCoupon,
  ensureAmbassadorCoupon,
  getAmbassadorCreditBalance,
} from '@/lib/db/ambassador-credits';
import type { Ambassador } from '@/lib/db/types';
import type { ReferralCodeRow } from '@/app/admin/referral-codes/referral-codes-client';

/**
 * PATCH /api/admin/referral-codes/[id] — change a code, deactivate
 * or reactivate it (admin only).
 *
 * - change-code: the admin types the NEW code (validated like an
 *   assignment); the old code's coupon is deactivated and the new
 *   code's Rs 200 coupon is ensured. The ambassador keeps their
 *   team, stats and credits — only the code changes.
 * - deactivate: the code stops attributing NEW signups (resolution
 *   requires 'active') and its coupon is deactivated. Existing team,
 *   stats and credits are untouched.
 * - reactivate: status back to active + the coupon ensured again.
 */
const patchSchema = z.object({
  action: z.enum(['change-code', 'deactivate', 'reactivate']),
  referralCode: z.string().optional(),
});

async function toRow(ambassador: Ambassador): Promise<ReferralCodeRow> {
  const [{ stats }, credits, discounts] = await Promise.all([
    getAmbassadorStats(ambassador.id),
    getAmbassadorCreditBalance(ambassador.id),
    countAmbassadorDiscounts([ambassador.referralCode]),
  ]);
  return {
    id: ambassador.id,
    code: ambassador.referralCode,
    email: ambassador.email,
    name: ambassador.email,
    status: ambassador.status,
    signups: stats.signups,
    enrollments: stats.enrollments,
    payments: stats.payments,
    credits,
    discounts: discounts.get(ambassador.referralCode) ?? 0,
  };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('referral-codes');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return invalidBody('an action is required');
  try {
    const ambassador = await getAmbassadorById(id);
    if (!ambassador) return NextResponse.json({ error: 'Ambassador not found' }, { status: 404 });

    if (parsed.data.action === 'change-code') {
      if (!parsed.data.referralCode?.trim()) return invalidBody('a new referral code is required');
      const oldCode = ambassador.referralCode;
      const updated = await updateAmbassadorCode(id, parsed.data.referralCode);
      if (!updated) return NextResponse.json({ error: 'Ambassador not found' }, { status: 404 });
      await deactivateAmbassadorCoupon(oldCode);
      await ensureAmbassadorCoupon(updated.referralCode);
      return NextResponse.json({ row: await toRow(updated) });
    }

    if (parsed.data.action === 'deactivate') {
      const updated = await updateAmbassadorStatus(id, 'inactive');
      if (!updated) return NextResponse.json({ error: 'Ambassador not found' }, { status: 404 });
      await deactivateAmbassadorCoupon(ambassador.referralCode);
      return NextResponse.json({ row: await toRow(updated) });
    }

    const updated = await updateAmbassadorStatus(id, 'active');
    if (!updated) return NextResponse.json({ error: 'Ambassador not found' }, { status: 404 });
    await ensureAmbassadorCoupon(ambassador.referralCode);
    return NextResponse.json({ row: await toRow(updated) });
  } catch (e) {
    if (e instanceof Error && e.message.includes('not set up yet')) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    if (
      e instanceof Error &&
      (e.message.includes('already assigned') || e.message.includes('must be exactly'))
    ) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
