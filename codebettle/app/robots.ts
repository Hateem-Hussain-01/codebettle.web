import type { MetadataRoute } from 'next';

/**
 * robots.txt (Phase 7, CB-16 SEO).
 * Crawlers may index the public site and the sitemap. Portals, auth,
 * API routes and /verify are disallowed: portal pages need a login,
 * and /verify URLs carry certificate verification tokens, which must
 * never be indexed.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/student/', '/instructor/', '/auth/', '/api/', '/verify/'],
    },
    sitemap: 'https://codebettle-web.vercel.app/sitemap.xml',
  };
}
