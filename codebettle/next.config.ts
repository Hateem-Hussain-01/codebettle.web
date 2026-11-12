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
