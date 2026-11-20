import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { createAmbassador } from '@/lib/db/ambassadors';
import { ensureAmbassadorCoupon } from '@/lib/db/ambassador-credits';

/**
 * POST /api/admin/ambassadors/grant — grant ambassador status
 * directly by email (admin only).
 *
 * Eman gives referral codes to his own people (including himself)
 * without them going through the /become-ambassador form. The admin
 * CHOOSES the code (Eman, 20 Nov 2026) — it is required here and
 * validated (format + free across both namespaces); the code's Rs 200
 * coupon is ensured right away. Creates the ambassador for the email,
 * linking the user account now when one exists with that email.
 * Idempotent: granting an already-ambassador email returns the
 * existing record.
 */
const postSchema = z.object({
  email: z.string().min(1).email(),
  referralCode: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('ambassadors');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return invalidBody('a valid email and referral code are required');
  try {
    const ambassador = await createAmbassador({
      email: parsed.data.email,
      referralCode: parsed.data.referralCode,
    });
    await ensureAmbassadorCoupon(ambassador.referralCode);
    return NextResponse.json({ ambassador }, { status: 201 });
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
