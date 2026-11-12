import { NextRequest, NextResponse } from 'next/server';
import { buildCspHeader, generateNonce } from '@/lib/security';

/**
 * Route guard + security headers (Next.js 16 `proxy`, formerly middleware).
 *
 * Three jobs:
 *
 * 1. Maintenance gate (Settings fix): when the admin turns
 *    maintenance mode on, every public path is rewritten to
 *    /maintenance. The flag comes from GET /api/settings/public
 *    (public, no auth), fetched with a short cache and fail-open
 *    semantics — on ANY fetch error, timeout or non-OK response the
 *    site proceeds normally (maintenance OFF), so a down database or
 *    a missing settings migration can never take the site down.
 *    /admin, /auth and /maintenance itself stay open so admins can
 *    still sign in and turn maintenance off. No Prisma / lib/db
 *    imports here: the proxy runs on the Edge runtime, which cannot
 *    run Node-only modules.
 *
 * 2. Portal gate (COARSE only): redirects to login when no session
 *    cookie is present at all on /student, /instructor or /admin. It
 *    deliberately does NOT decode the cookie or trust any role from
 *    it — the old code base64-decoded the cookie here and trusted the
 *    role inside it, which anyone could forge. Real authorisation
 *    happens server-side in each portal layout via getSession()
 *    (lib/auth.ts), which validates the opaque token against the
 *    server-side session store and reads the role from the user record.
 *
 * 3. Nonce CSP (Phase 7, SEC-09): every page request gets a fresh
 *    nonce and a Content-Security-Policy header built by
 *    buildCspHeader() (lib/security.ts). Next.js stamps the nonce on
 *    its own inline scripts during server rendering, so pages must be
 *    dynamically rendered — the proxy runs on every page route, which
 *    makes previously-static pages dynamic (visible in the build
 *    output as ○ → ƒ). API routes, static assets and prefetch
 *    requests are excluded from the matcher.
 *
 * NOTE: this function is async (the maintenance check fetches the
 * public settings route). Callers that used to call it synchronously
 * — tests/csp.test.ts — must await it.
 */

/** Paths the maintenance gate never rewrites. */
const MAINTENANCE_EXEMPT = ['/admin', '/auth'];

/**
 * Fail-open maintenance check: true only when the public settings
 * route answers { maintenanceMode: true }. Any fetch error, abort
 * (2s timeout), non-OK status or unparseable body means OFF.
 */
async function isMaintenanceMode(request: NextRequest): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(new URL('/api/settings/public', request.url), {
        signal: controller.signal,
        next: { revalidate: 30 },
      });
      if (!res.ok) return false;
      const data: unknown = await res.json().catch(() => null);
      return (
        !!data &&
        typeof data === 'object' &&
        (data as { maintenanceMode?: unknown }).maintenanceMode === true
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Offline / DB down / route missing / timeout: maintenance OFF.
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCspHeader(nonce, process.env.NODE_ENV === 'development');

  const session = request.cookies.get('cb_session');
  const { pathname } = request.nextUrl;

  // 1. Maintenance gate — before the portal gate. /maintenance itself
  // must be exempt or the rewrite would loop; /admin and /auth stay
  // open so an admin can sign in and turn maintenance off. /api and
  // static assets never reach this proxy (see matcher).
  const isMaintenanceExempt =
    pathname === '/maintenance' ||
    MAINTENANCE_EXEMPT.some((r) => pathname.startsWith(r));
  if (!isMaintenanceExempt && (await isMaintenanceMode(request))) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
    // Item G: same x-pathname the normal path sets, for the admin
    // layout's per-area guard (harmless on the maintenance page).
    requestHeaders.set('x-pathname', pathname);
    const response = NextResponse.rewrite(new URL('/maintenance', request.url), {
      request: { headers: requestHeaders },
    });
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }

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
  // Item G: the requested path, for the admin layout's per-area guard.
  // The layout reads it via headers() and redirects a restricted admin
  // away from areas they were not granted. Prefetch requests skip this
  // proxy (see matcher) — the layout treats a missing header as "cannot
  // tell" and skips the redirect; dynamic admin pages are not prefetched
  // (no loading.tsx), so a prefetch can never smuggle a denied page in.
  requestHeaders.set('x-pathname', pathname);

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
