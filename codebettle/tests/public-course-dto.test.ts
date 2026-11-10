import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { toPublicCourse } from '../lib/db/mappers';
import { getCourseBySlug } from '../lib/db/courses';
import type { Course } from '../lib/db/types';
import { GET as listCourses } from '../app/api/courses/route';
import { GET as getCourseBySlugRoute } from '../app/api/courses/[slug]/route';

/**
 * Phase 7 — public course DTO (SEC-07/CB-06 fix).
 * Zoom links are for enrolled students only. The public catalogue API,
 * the public course-detail API and every public page must serve courses
 * without zoomLink. The full Course (with zoomLink) still exists in the
 * database and is used by the admin/instructor surfaces and by the
 * student course page, which checks the enrolment first.
 */

const D = (s: string) => new Date(s);
const ZOOM = 'https://zoom.us/j/1234567890';

let fake: FakeDb;

function seedCourse(overrides: Partial<Record<string, unknown>> = {}) {
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: 'Long',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: ZOOM, schedule: null, status: 'published',
      isFeatured: true, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 1, rating: 4.5, reviewCount: 2,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
      ...overrides,
    },
  ]);
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  seedCourse();
});

test('toPublicCourse strips zoomLink and keeps everything else', () => {
  const course: Course = {
    id: 'c1', slug: 's', title: 'T', description: 'd', longDescription: 'ld',
    thumbnail: '/t.png', category: 'Web Development', level: 'beginner', price: 5000,
    isFree: false, instructorId: 'inst-1', zoomLink: ZOOM, status: 'published',
    isFeatured: false, isCompleted: false, modules: [], requirements: [], whatYouLearn: [],
    tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
  };
  const pub = toPublicCourse(course);
  assert.equal('zoomLink' in pub, false);
  assert.equal(pub.id, 'c1');
  assert.equal(pub.title, 'T');
  assert.equal(pub.price, 5000);
  assert.equal(pub.slug, 's');
  // The original is untouched — stripping must not mutate the stored course.
  assert.equal(course.zoomLink, ZOOM);
});

test('the stored course really has a Zoom link (guard against a vacuous test)', async () => {
  const stored = await getCourseBySlug('web-101');
  assert.ok(stored);
  assert.equal(stored.zoomLink, ZOOM);
});

test('GET /api/courses never returns zoomLink', async () => {
  const res = await listCourses(new NextRequest('http://localhost/api/courses'));
  assert.equal(res.status, 200);
  const body = await res.json() as { items: Record<string, unknown>[] };
  assert.equal(body.items.length, 1);
  assert.equal('zoomLink' in body.items[0], false);
  assert.equal(body.items[0].title, 'Web 101');
  assert.equal(JSON.stringify(body).includes('zoom.us'), false);
});

test('GET /api/courses/[slug] never returns zoomLink', async () => {
  const res = await getCourseBySlugRoute(new NextRequest('http://localhost/api/courses/web-101'), { params: Promise.resolve({ slug: 'web-101' }) });
  assert.equal(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assert.equal('zoomLink' in body, false);
  assert.equal(body.slug, 'web-101');
  assert.equal(JSON.stringify(body).includes('zoom.us'), false);
});

test('GET /api/courses/[slug] still 404s for an unknown slug', async () => {
  const res = await getCourseBySlugRoute(new NextRequest('http://localhost/api/courses/nope'), { params: Promise.resolve({ slug: 'nope' }) });
  assert.equal(res.status, 404);
});
