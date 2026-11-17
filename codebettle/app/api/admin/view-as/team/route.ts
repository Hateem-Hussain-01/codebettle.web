import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminAreas, serviceError } from '@/lib/api-helpers';
import { teamViewAsSchema } from '@/lib/api-schemas';
import { startTeamViewAs } from '@/lib/services/recruitment-service';
import { VIEW_AS_COOKIE } from '@/lib/view-as';

/**
 * POST /api/admin/view-as/team — mint a signed token to view ONE
 * team member's portal (/team/dashboard), and set it as an httpOnly
 * cookie. Mirrors POST /api/admin/view-as/ambassador, gated on the
 * 'team' admin area instead of 'ambassadors'.
 *
 * NO TIME LIMIT (Eman, 16 Nov 2026 — the ADM-02 30-minute TTL is
 * removed): the token carries no expiry. The viewing session ends on
 * Exit (POST /api/admin/view-as/exit), sign-out, or closing the
 * browser (the cookie is a browser-session cookie, no max-age
 * attribute). The token is re-validated on every request
 * (signature, admin match, member still holding active team
 * access), so a revoked member loses view-as immediately, and it
 * dies with the admin's own session (72h idle / 7-day absolute,
 * PR #53).
 *
 * Team portals ONLY: the service refuses anyone without active
 * TeamAccess (and the session overlay in lib/auth.ts re-checks it
 * on every request). The team layout admits a view-as session of
 * kind 'team' and bounces other kinds away. The token never carries
 * password material and never creates/resets/exposes the member's
 * password; the admin's own session and the member's sessions are
 * untouched. The mint is audit-logged (admin.view_as.start). While
 * viewing, team write routes refuse mutations (assertNotViewAs) and
 * the banner offers the way back (POST /api/admin/view-as/exit,
 * return to /admin/team).
 */
export async function POST(request: NextRequest) {
  // Entry point is the admin Team page — the Team access list's
  // per-row "Switch to Team Portal" button.
  const auth = await requireAdminAreas(['team']);
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = teamViewAsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A team member is required' }, { status: 400 });
  }
  const result = await startTeamViewAs(auth.session, parsed.data.teamMemberId);
  if ('error' in result) return serviceError(result);
  const response = NextResponse.json({
    member: result.member,
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
