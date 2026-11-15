import { NextRequest, NextResponse } from 'next/server';
import { getAmbassadorByCode, recordReferralClick } from '@/lib/db/ambassadors';
import { normalizeReferralCode } from '@/lib/referral';
import { getClientIp } from '@/lib/rate-limit';

/**
 * GET /api/referral/track?code=XXXX — referral-link landing.
 *
 * Called by the proxy when a visitor lands with `?ref=CODE` (and by
 * nothing else). Validates the code server-side: an unknown,
 * inactive or malformed code answers { valid: false } and records
 * nothing — silently, so a bad link never shows an error page. A
 * valid code records one click (ip + UTC day; the displayed count
 * dedupes by (ip, day)) and answers { valid: true } so the proxy
 * can set the `cb_ref` cookie.
 *
 * Fail-open by design: any error answers { valid: false } — a
 * missing referral table or a down database must never break the
 * landing page.
 */
export async function GET(request: NextRequest) {
  try {
    const code = normalizeReferralCode(request.nextUrl.searchParams.get('code') ?? '');
    if (!code) return NextResponse.json({ valid: false });
    const ambassador = await getAmbassadorByCode(code);
    if (!ambassador || ambassador.status !== 'active') {
      return NextResponse.json({ valid: false });
    }
    await recordReferralClick(ambassador.id, getClientIp(request));
    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
