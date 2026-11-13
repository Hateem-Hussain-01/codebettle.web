import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { adminUrl, dashboardUrlForRole } from '@/lib/admin-url';

/**
 * GET /api/portal — redirect to the signed-in user's portal destination.
 *
 * A server-side redirect, so client components (the public Navbar)
 * can link an admin to their portal without ever knowing the secret
 * admin base path (PR #33): the secret never leaves the server. The
 * Navbar uses this for an admin's portal/profile/settings links;
 * students/instructors keep their direct links.
 *
 * Query param `to`: 'dashboard' (default), 'profile', 'settings'.
 * Admins go to the secret admin path; everyone else to their portal.
 * Settings links to the profile page where no portal settings page
 * exists (only /admin/settings exists) — same rule as
 * lib/user-menu.ts. No session → /auth/login.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }
  const to = request.nextUrl.searchParams.get('to') ?? 'dashboard';
  const isAdmin = session.role === 'admin';
  if (to === 'profile') {
    const url = isAdmin ? adminUrl('/profile') : `/${session.role}/profile`;
    return NextResponse.redirect(new URL(url, request.url));
  }
  if (to === 'settings') {
    const url = isAdmin ? adminUrl('/settings') : `/${session.role}/profile`;
    return NextResponse.redirect(new URL(url, request.url));
  }
  return NextResponse.redirect(new URL(dashboardUrlForRole(session.role), request.url));
}
