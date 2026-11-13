import type { NextConfig } from "next";

/**
 * Security headers (Phase 1). Applied to every route.
 * No Content-Security-Policy yet: a strict CSP needs per-request nonces to
 * avoid breaking Next.js inline scripts, so it is a Phase 7 hardening item.
 *
 * NOTE: X-Frame-Options is NOT set here any more. It used to be DENY
 * for every path, but the Forms GHL embed render (?embed=1 on
 * /forms/[slug]) must be frameable — and headers() matches paths, not
 * query strings, so it cannot make that exemption. X-Frame-Options is
 * now set per-request in proxy.ts (DENY everywhere except the embed
 * render; see setPageSecurityHeaders there). API routes and static
 * assets get no X-Frame-Options from either layer — they return JSON /
 * files, never a frameable document, so the header is meaningless there.
 */
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
];

const nextConfig: NextConfig = {
  /**
   * @sparticuz/chromium must stay external: it locates its binary
   * archives relative to its own package files (import.meta.url ->
   * ../bin). If the bundler relocated it into the server bundle,
   * that path would not exist and the download route would throw at
   * launch ("The input directory ... does not exist").
   */
  serverExternalPackages: ['@sparticuz/chromium'],
  /**
   * The Chromium .br archives are read off disk at request time
   * through a dynamically computed path, so Next's file tracer
   * cannot see them and packs the download function WITHOUT the
   * binary — the route deploys cleanly and throws at launch. Name
   * them by hand for the download route. The key is the route path
   * with the dynamic segment escaped (picomatch would read [id] as
   * a character class otherwise); the glob is resolved from the
   * project root (the folder holding next.config.ts). Verify after
   * build: .next/server/app/api/certificates/[id]/download/
   * route.js.nft.json must list the bin/ archives.
   */
  outputFileTracingIncludes: {
    '/api/certificates/\\[id\\]/download': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
