import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateCoupon } from '@/lib/db/coupons';

/**
 * POST /api/coupons/validate — check a coupon code (public).
 * Body: { code: string }. Returns { valid: true, coupon } or
 * { valid: false }. The coupon list must never ship to the browser —
 * the old client-side validateCoupon imported the whole array.
 */
const schema = z.object({ code: z.string().min(1) });

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Coupon code is required' }, { status: 400 });
  }
  const coupon = await validateCoupon(parsed.data.code);
  if (!coupon) return NextResponse.json({ valid: false });
  return NextResponse.json({ valid: true, coupon });
}
