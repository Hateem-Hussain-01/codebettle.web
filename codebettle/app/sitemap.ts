import type { MetadataRoute } from 'next';
import { getPublishedCourses } from '@/lib/db/courses';
import { getPublishedPosts } from '@/lib/db/blog';

/**
 * Sitemap (Phase 7, CB-16 SEO).
 * Static public pages plus every published course and published blog
 * post, so search engines can find the content. Portal pages
 * (/admin, /student, /instructor), auth pages and /verify are
 * deliberately absent — they are private or useless to index (robots
 * also disallows them). The canonical host is the live Vercel URL.
 *
 * force-dynamic: the sitemap reads the database, so it must be
 * generated per request, not prerendered at build time (there is no
 * database at build time).
 */
export const dynamic = 'force-dynamic';

const SITE_URL = 'https://codebettle-web.vercel.app';

const STATIC_PAGES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/courses', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/blog', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/instructors', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/become-instructor', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/book-a-call', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/become-ambassador', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'monthly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'monthly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [courses, posts] = await Promise.all([getPublishedCourses(), getPublishedPosts()]);
  return [
    ...STATIC_PAGES.map((p) => ({
      url: `${SITE_URL}${p.path}`,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
    })),
    ...courses.map((c) => ({
      url: `${SITE_URL}/courses/${c.slug}`,
      lastModified: new Date(c.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...posts.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: new Date(p.publishedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
