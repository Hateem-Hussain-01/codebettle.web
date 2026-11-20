import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { createAmbassador } from '@/lib/db/ambassadors';
import { ensureAmbassadorCoupon } from '@/lib/db/ambassador-credits';
import type { ReferralCodeRow } from '@/app/admin/referral-codes/referral-codes-client';

/**
 * POST /api/admin/referral-codes — assign a code (admin only).
 *
 * Gives ambassador status + an ADMIN-CHOSEN referral code to an
 * email (Eman, 20 Nov 2026) — no application needed. The code is
 * validated (6 chars, free across both namespaces) and the code's
 * Rs 200 coupon is ensured right away. A fresh grant has no uses
 * yet, so the returned row carries zeros.
 */
const postSchema = z.object({
  email: z.string().min(1).email(),
  referralCode: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('referral-codes');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return invalidBody('a valid email and referral code are required');
  try {
    const ambassador = await createAmbassador({
      email: parsed.data.email,
      referralCode: parsed.data.referralCode,
    });
    // The code IS a Rs 200 coupon — ensure it now (best-effort: a
    // failed coupon sync is repaired by the page backfill on the next
    // admin visit).
    await ensureAmbassadorCoupon(ambassador.referralCode);
    const row: ReferralCodeRow = {
      id: ambassador.id,
      code: ambassador.referralCode,
      email: ambassador.email,
      name: ambassador.email,
      status: ambassador.status,
      signups: 0,
      enrollments: 0,
      payments: 0,
      credits: 0,
      discounts: 0,
    };
    return NextResponse.json({ row }, { status: 201 });
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
