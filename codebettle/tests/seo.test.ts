import test from 'node:test';
import assert from 'node:assert/strict';
import { __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import sitemap from '../app/sitemap';
import robots from '../app/robots';

/**
 * Phase 7 — SEO (CB-16 fix): sitemap, robots and per-page metadata.
 * Before Phase 7 there was no sitemap, no robots.txt and no
 * generateMetadata anywhere — every page shared the generic site
 * title. The sitemap lists public pages + published courses/posts
 * only; robots keeps portals, auth, API routes and /verify (whose
 * URLs carry certificate tokens) out of search indexes.
 */

const D = (s: string) => new Date(s);
const SITE = 'https://codebettle-web.vercel.app';

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: 'Long',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-05-20'),
    },
    {
      id: 'course-2', slug: 'draft-101', title: 'Draft', description: 'D', longDescription: 'D',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 0, isFree: true,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'draft',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('BlogPost', [
    { id: 'blog-1', slug: 'hello', title: 'Hello', excerpt: 'E', content: 'Body', pdfUrl: null, thumbnail: '/b.png', category: 'General', authorId: 'admin-1', authorName: 'Admin', publishedAt: D('2024-05-01'), isPublished: true, readTime: '3 min', tags: [], createdAt: D('2024-05-01'), updatedAt: D('2024-05-01') },
    { id: 'blog-2', slug: 'draft-post', title: 'Draft', excerpt: 'E', content: 'Body', pdfUrl: null, thumbnail: '/b.png', category: 'General', authorId: 'admin-1', authorName: 'Admin', publishedAt: D('2024-05-01'), isPublished: false, readTime: '3 min', tags: [], createdAt: D('2024-05-01'), updatedAt: D('2024-05-01') },
  ]);
});

test('sitemap lists public pages + published courses/posts only', async () => {
  const urls = await sitemap();
  const locs = urls.map((u) => u.url);
  // Static public pages (the homepage entry is '/' so its URL carries the trailing slash).
  for (const p of ['/', '/courses', '/blog', '/about', '/instructors', '/contact', '/privacy', '/terms']) {
    assert.ok(locs.includes(`${SITE}${p}`), `missing ${p}`);
  }
  // Published course + post, with lastModified.
  const course = urls.find((u) => u.url === `${SITE}/courses/web-101`);
  assert.ok(course);
  assert.equal(course.priority, 0.8);
  const post = urls.find((u) => u.url === `${SITE}/blog/hello`);
  assert.ok(post);
  // Drafts are never listed.
  assert.equal(locs.includes(`${SITE}/courses/draft-101`), false);
  assert.equal(locs.includes(`${SITE}/blog/draft-post`), false);
  // Nothing private or auth-related is listed.
  assert.equal(locs.some((u) => u.includes('/admin') || u.includes('/student') || u.includes('/auth') || u.includes('/verify')), false);
  // Every URL is on the canonical host.
  assert.ok(locs.every((u) => u.startsWith(SITE)));
});

test('robots allows the public site, disallows portals/auth/api/verify', () => {
  const r = robots();
  assert.equal(r.sitemap, `${SITE}/sitemap.xml`);
  const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
  assert.equal(rules.userAgent, '*');
  assert.equal(rules.allow, '/');
  const disallow = rules.disallow as string[];
  for (const p of ['/admin/', '/student/', '/instructor/', '/auth/', '/api/', '/verify/']) {
    assert.ok(disallow.includes(p), `missing disallow ${p}`);
  }
});

test('generateMetadata returns per-course and per-post titles', async () => {
  const { generateMetadata: courseMeta } = await import('../app/courses/[slug]/page');
  const course = await courseMeta({ params: Promise.resolve({ slug: 'web-101' }) });
  assert.equal(course.title, 'Web 101 | CodeBettle');
  assert.equal(course.description, 'Intro');
  const missing = await courseMeta({ params: Promise.resolve({ slug: 'nope' }) });
  assert.equal(missing.title, 'Course not found | CodeBettle');

  const { generateMetadata: postMeta } = await import('../app/blog/[slug]/page');
  const post = await postMeta({ params: Promise.resolve({ slug: 'hello' }) });
  assert.equal(post.title, 'Hello | CodeBettle');
  assert.equal(post.description, 'E');
});
