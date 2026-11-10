import { NextRequest, NextResponse } from 'next/server';
import { buildCspHeader, generateNonce } from '@/lib/security';

/**
 * Route guard + security headers (Next.js 16 `proxy`, formerly middleware).
 *
 * Two jobs:
 *
 * 1. Portal gate (COARSE only): redirects to login when no session
 *    cookie is present at all on /student, /instructor or /admin. It
 *    deliberately does NOT decode the cookie or trust any role from
 *    it — the old code base64-decoded the cookie here and trusted the
 *    role inside it, which anyone could forge. Real authorisation
 *    happens server-side in each portal layout via getSession()
 *    (lib/auth.ts), which validates the opaque token against the
 *    server-side session store and reads the role from the user record.
 *
 * 2. Nonce CSP (Phase 7, SEC-09): every page request gets a fresh
 *    nonce and a Content-Security-Policy header built by
 *    buildCspHeader() (lib/security.ts). Next.js stamps the nonce on
 *    its own inline scripts during server rendering, so pages must be
 *    dynamically rendered — the proxy runs on every page route, which
 *    makes previously-static pages dynamic (visible in the build
 *    output as ○ → ƒ). API routes, static assets and prefetch
 *    requests are excluded from the matcher.
 */
export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCspHeader(nonce, process.env.NODE_ENV === 'development');

  const session = request.cookies.get('cb_session');
  const { pathname } = request.nextUrl;

  const protectedRoutes = ['/student', '/instructor', '/admin'];
  const isProtected = protectedRoutes.some((r) => pathname.startsWith(r));

  if (isProtected && !session) {
    const redirect = NextResponse.redirect(new URL('/auth/login', request.url));
    redirect.headers.set('Content-Security-Policy', csp);
    return redirect;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
