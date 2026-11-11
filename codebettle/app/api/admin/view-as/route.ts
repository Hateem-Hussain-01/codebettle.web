import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminAreas, serviceError } from '@/lib/api-helpers';
import { viewAsSchema } from '@/lib/api-schemas';
import { startViewAs } from '@/lib/services/recruitment-service';
import { VIEW_AS_COOKIE, VIEW_AS_TTL_MS } from '@/lib/view-as';

/**
 * POST /api/admin/view-as — mint a short-lived (15 min) signed token
 * to view ONE teacher's portal, and set it as an httpOnly cookie.
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
  const auth = await requireAdminAreas(['applications', 'instructors']);
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
    maxAge: Math.floor(VIEW_AS_TTL_MS / 1000),
    path: '/',
  });
  return response;
}
