import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminAreas, serviceError } from '@/lib/api-helpers';
import { ambassadorViewAsSchema } from '@/lib/api-schemas';
import { startAmbassadorViewAs } from '@/lib/services/recruitment-service';
import { VIEW_AS_COOKIE } from '@/lib/view-as';

/**
 * POST /api/admin/view-as/ambassador — mint a signed token to view
 * ONE approved ambassador's dashboard (/student/ambassador), and set
 * it as an httpOnly cookie. Mirrors POST /api/admin/view-as
 * (teacher view-as), gated on the 'ambassadors' admin area instead
 * of 'instructors'.
 *
 * NO TIME LIMIT (Eman, 16 Nov 2026 — the ADM-02 30-minute TTL is
 * removed): the token carries no expiry. The viewing session ends on
 * Exit (POST /api/admin/view-as/exit), sign-out, or closing the
 * browser (the cookie is a browser-session cookie, no max-age
 * attribute). The token is re-validated on every request
 * (signature, admin match, ambassador still approved and active),
 * so a deactivated ambassador loses view-as immediately, and it
 * dies with the admin's own session (72h idle / 7-day absolute,
 * PR #53).
 *
 * Ambassador dashboards ONLY: the service refuses anyone without an
 * active Ambassador row (and the session overlay in lib/auth.ts
 * re-checks it on every request). The student layout admits a
 * view-as session to exactly one route — /student/ambassador — and
 * redirects every other /student/* route back to the dashboard. The
 * token never carries password material and never creates/resets/
 * exposes the ambassador's password; the admin's own session and
 * the ambassador's sessions are untouched. The mint is audit-logged
 * (admin.view_as.start). While viewing, write routes refuse
 * mutations (assertNotViewAs) and the banner offers the way back
 * (POST /api/admin/view-as/exit, return to /admin/ambassadors).
 */
export async function POST(request: NextRequest) {
  // Entry point is the Ambassadors page — the Referral Tracking
  // section's per-row "Switch to Ambassador Dashboard" button.
  const auth = await requireAdminAreas(['ambassadors']);
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = ambassadorViewAsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'An ambassador is required' }, { status: 400 });
  }
  const result = await startAmbassadorViewAs(auth.session, parsed.data.ambassadorId);
  if ('error' in result) return serviceError(result);
  const response = NextResponse.json({
    ambassador: result.ambassador,
  });
  response.cookies.set(VIEW_AS_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    // No max-age attribute: a browser-session cookie — closing the
    // browser ends the viewing session. The token itself carries no
    // expiry either (Eman, 16 Nov 2026 — the ADM-02 30-minute TTL is
    // removed); it is re-validated server-side on every request and
    // dies with the admin's own session.
    path: '/',
  });
  return response;
}
