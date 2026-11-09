import { NextRequest, NextResponse } from 'next/server';

/**
 * Route guard (Next.js 16 `proxy`, formerly middleware).
 *
 * This is a COARSE gate only: it redirects to login when no session cookie
 * is present at all. It deliberately does NOT decode the cookie or trust
 * any role from it — the old code base64-decoded the cookie here and
 * trusted the role inside it, which anyone could forge.
 *
 * Real authorisation happens server-side in each portal layout via
 * getSession() (lib/auth.ts), which validates the opaque token against
 * the server-side session store and reads the role from the user record.
 */
export function proxy(request: NextRequest) {
  const session = request.cookies.get('cb_session');
  const { pathname } = request.nextUrl;

  const protectedRoutes = ['/student', '/instructor', '/admin'];
  const isProtected = protectedRoutes.some((r) => pathname.startsWith(r));

  if (!isProtected) return NextResponse.next();

  if (!session) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/student/:path*', '/instructor/:path*', '/admin/:path*'],
};
