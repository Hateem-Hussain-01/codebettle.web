import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminAreas, serviceError } from '@/lib/api-helpers';
import { viewAsSchema } from '@/lib/api-schemas';
import { startViewAs } from '@/lib/services/recruitment-service';
import { VIEW_AS_COOKIE } from '@/lib/view-as';

/**
 * POST /api/admin/view-as — mint a signed token to view ONE teacher's
 * portal, and set it as an httpOnly cookie.
 *
 * No expiry: the viewing session lasts until the admin clicks Exit
 * (POST /api/admin/view-as/exit), signs out, or closes the browser —
 * the cookie is a browser-session cookie (no max-age attribute). The token is
 * re-validated on every request (signature, admin match, teacher
 * still a teacher and active), so a revoked teacher loses view-as
 * immediately.
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
    // No max-age attribute: a browser-session cookie — the viewing session ends
    // on Exit, logout, or closing the browser, never on a timer.
    path: '/',
  });
  return response;
}
