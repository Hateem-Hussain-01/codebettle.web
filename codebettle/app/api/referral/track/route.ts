import { NextRequest, NextResponse } from 'next/server';
import { getAmbassadorByCode, recordReferralClick } from '@/lib/db/ambassadors';
import { getTeamReferralCodeByCode } from '@/lib/db/team-credits';
import { getTeamAccessById } from '@/lib/db/team';
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
 * Team codes (PR B, Eman 16 Nov 2026): the SAME `?ref=` capture
 * serves team members' links. A valid ACTIVE team code also answers
 * { valid: true } so the cookie is set and the signup attributes to
 * the team member — but no click row is recorded (team click stats
 * are not part of the credit system; only enrollments earn credits).
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
    if (ambassador && ambassador.status === 'active') {
      await recordReferralClick(ambassador.id, getClientIp(request));
      return NextResponse.json({ valid: true });
    }
    const teamCode = await getTeamReferralCodeByCode(code);
    if (teamCode) {
      const access = await getTeamAccessById(teamCode.teamAccessId);
      if (access && access.status === 'active') {
        return NextResponse.json({ valid: true });
      }
    }
    return NextResponse.json({ valid: false });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
