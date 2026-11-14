import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminAreas, serviceError } from '@/lib/api-helpers';
import { viewAsSchema } from '@/lib/api-schemas';
import { startViewAs } from '@/lib/services/recruitment-service';
import { VIEW_AS_COOKIE } from '@/lib/view-as';

/**
 * POST /api/admin/view-as — mint a signed token to view ONE teacher's
 * portal, and set it as an httpOnly cookie.
 *
 * ADM-02: the token lives 30 minutes from minting (VIEW_AS_TTL_MS,
 * returned as expiresAt) — the viewing session ends when it expires,
 * or earlier on Exit (POST /api/admin/view-as/exit), sign-out, or
 * closing the browser (the cookie is a browser-session cookie, no
 * max-age attribute). The token is re-validated on every request
 * (signature, expiry, admin match, teacher still a teacher and
 * active), so a revoked teacher loses view-as immediately.
 *
 * Teacher Portals ONLY: the service refuses students (and the
 * session overlay in lib/auth.ts re-checks the teacher flag on every
 * request). The token never carries password material and never
 * creates/resets/exposes the teacher's password; the admin's own
 * session and the teacher's sessions are untouched. The mint is
 * audit-logged (admin.view_as.start). While viewing, write routes
 * refuse mutations (assertNotViewAs) and the banner offers the way
 * back (POST /api/admin/view-as/exit).
 */
export async function POST(request: NextRequest) {
  // Entry point is the Instructors page — the Applications page no
  // longer mints view-as tokens.
  const auth = await requireAdminAreas(['instructors']);
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = viewAsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A teacher is required' }, { status: 400 });
  }
  const result = await startViewAs(auth.session, parsed.data.teacherId);
  if ('error' in result) return serviceError(result);
  const response = NextResponse.json({
    teacher: result.teacher,
    expiresAt: result.expiresAt,
  });
  response.cookies.set(VIEW_AS_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    // No max-age attribute: a browser-session cookie — closing the
    // browser ends the viewing session. The token itself also expires
    // 30 minutes after minting (ADM-02), enforced server-side.
    path: '/',
  });
  return response;
}
