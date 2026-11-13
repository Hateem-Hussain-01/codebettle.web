import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetDbClient, __setDbClient, type DbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { getCourseById, getCourseOutlineUrl } from '../lib/db/courses';
import { mapCourseRow, toPublicCourse } from '../lib/db/mappers';
import { courseCreateSchema, courseUpdateSchema } from '../lib/api-schemas';
import CourseCard from '../components/ui/CourseCard';
import type { Course } from '../lib/db/types';

/**
 * Course outline URL + home-page price hiding.
 *
 * - outlineUrl is a nullable Course column (Prisma migration
 *   20261113T0805_add_course_outline_url). It is exposed on the public
 *   course DTO (toPublicCourse) so the course detail page can link it,
 *   and course reads stay fail-safe when the migration has not run yet
 *   (a missing outlineUrl column is treated as "no outline").
 * - CourseCard takes an optional showPrice prop (default true). The
 *   home-page featured-courses section passes showPrice={false} so the
 *   fee is revealed only on the course detail page.
 */

const D = (s: string) => new Date(s);
const OUTLINE_URL =
  'https://phuzoxshzdfzjvephlhq.supabase.co/storage/v1/object/public/course-images/outlines/python-crash-course-outline.pdf';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

let fake: FakeDb;

function seedCourse(overrides: Record<string, unknown> = {}) {
  fake.seed('Course', [
    {
      id: 'course-1',
      slug: 'py-crash',
      title: 'Python Crash Course Batch 09',
      description: 'Intro',
      longDescription: 'Long',
      thumbnail: '/t.png',
      category: 'Web_Development',
      level: 'beginner',
      pricePkr: 1500,
      isFree: false,
      instructorId: 'inst-1',
      zoomLink: null,
      schedule: null,
      status: 'published',
      isFeatured: true,
      isCompleted: false,
      completedAt: null,
      requirements: [],
      whatYouLearn: [],
      tags: [],
      enrolledCount: 3,
      rating: 4.5,
      reviewCount: 2,
      certificateTemplateHtml: null,
      outlineUrl: OUTLINE_URL,
      createdAt: D('2024-04-01'),
      updatedAt: D('2024-04-01'),
      ...overrides,
    },
  ]);
  fake.seed('Module', [{ id: 'mod-1', courseId: 'course-1', title: 'Intro', position: 1 }]);
  fake.seed('Lesson', [
    {
      id: 'les-1',
      moduleId: 'mod-1',
      title: 'Lesson 1',
      position: 1,
      description: null,
      recordingUrl: null,
      materials: [],
      duration: null,
      date: null,
    },
  ]);
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedCourse();
  fake.seed('User', [
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

// --- outlineUrl mapping + public exposure -------------------------------

test('mapCourseRow maps outlineUrl, and defaults to null when the row has none', () => {
  const row = {
    id: 'course-1', slug: 'py-crash', title: 'Python Crash Course Batch 09', description: 'Intro',
    longDescription: 'Long', thumbnail: '/t.png', category: 'Web_Development', level: 'beginner',
    pricePkr: 1500, isFree: false, instructorId: 'inst-1', zoomLink: null, schedule: null,
    status: 'published', isFeatured: true, isCompleted: false, completedAt: null,
    requirements: [], whatYouLearn: [], tags: [], enrolledCount: 3, rating: 4.5, reviewCount: 2,
    certificateTemplateHtml: null, outlineUrl: OUTLINE_URL,
    createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
  } as Parameters<typeof mapCourseRow>[0];
  const course = mapCourseRow(row, []);
  assert.equal(course.outlineUrl, OUTLINE_URL);

  const legacy = mapCourseRow({ ...row, outlineUrl: undefined } as Parameters<typeof mapCourseRow>[0], []);
  assert.equal(legacy.outlineUrl, null);
});

test('toPublicCourse exposes outlineUrl (it is public, not a secret)', async () => {
  const course = await getCourseById('course-1');
  assert.ok(course);
  assert.equal(course.outlineUrl, OUTLINE_URL);
  const pub = toPublicCourse(course);
  assert.equal(pub.outlineUrl, OUTLINE_URL);
});

test('getCourseOutlineUrl returns the URL, and null when none is attached', async () => {
  assert.equal(await getCourseOutlineUrl('course-1'), OUTLINE_URL);
  seedCourse({ id: 'course-2', slug: 'no-outline', outlineUrl: null });
  assert.equal(await getCourseOutlineUrl('course-2'), null);
});

// --- fail-safe when the outline migration has not run yet ---------------

const missingOutlineColumnError = () =>
  Object.assign(new Error('column "public"."Course"."outlineUrl" does not exist'), {
    code: '42703',
  });

function makeRelationChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.orderBy = () => chain;
  chain.include = (_name: string, fn?: (m: unknown) => unknown) => {
    if (fn) fn(makeRelationChain());
    return chain;
  };
  return chain;
}

/** Course collection that throws 42703 (missing outlineUrl) on the full-column read and answers the legacy select. */
function makeOutlineThrowingCollection(legacyRows: Array<Record<string, unknown>>) {
  let selected = false;
  const chain: Record<string, unknown> = {};
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = () => chain;
  chain.offset = () => chain;
  chain.select = (..._fields: string[]) => {
    selected = true;
    return chain;
  };
  chain.include = (_name: string, fn?: (m: unknown) => unknown) => {
    if (fn) fn(makeRelationChain());
    return chain;
  };
  chain.first = async () => {
    if (!selected) throw missingOutlineColumnError();
    return legacyRows[0] ?? null;
  };
  chain.all = async () => {
    if (!selected) throw missingOutlineColumnError();
    return legacyRows;
  };
  return chain;
}

test('course reads fall back when the outlineUrl column is missing (treated as no outline)', async () => {
  const legacyRow = {
    id: 'course-1', slug: 'py-crash', title: 'Python Crash Course Batch 09', description: 'Intro',
    longDescription: 'Long', thumbnail: '/t.png', category: 'Web_Development', level: 'beginner',
    pricePkr: 1500, isFree: false, instructorId: 'inst-1', zoomLink: null, schedule: null,
    status: 'published', isFeatured: true, isCompleted: false, completedAt: null,
    requirements: [], whatYouLearn: [], tags: [], enrolledCount: 3, rating: 4.5, reviewCount: 2,
    createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    modules: [],
  };
  const stub = {
    orm: { public: { Course: { where: () => makeOutlineThrowingCollection([legacyRow]) } } },
  };
  __setDbClient(stub as unknown as DbClient);
  const course = await getCourseById('course-1');
  assert.ok(course);
  assert.equal(course.outlineUrl, null);
  assert.equal(course.title, 'Python Crash Course Batch 09');
});

test('getCourseOutlineUrl returns null when the column is missing', async () => {
  const stub = {
    orm: { public: { Course: { where: () => makeOutlineThrowingCollection([]) } } },
  };
  __setDbClient(stub as unknown as DbClient);
  assert.equal(await getCourseOutlineUrl('course-1'), null);
});

// --- schema validation ---------------------------------------------------

test('course schemas accept a valid outlineUrl, reject a bad one, and allow clearing it', () => {
  const base = {
    slug: 'py-crash', title: 'Python Crash Course Batch 09', description: 'd', longDescription: 'ld',
    thumbnail: '/t.png', category: 'Web Development', level: 'beginner', price: 1500,
  };
  assert.equal(courseCreateSchema.safeParse({ ...base, outlineUrl: OUTLINE_URL }).success, true);
  assert.equal(courseCreateSchema.safeParse({ ...base, outlineUrl: 'not-a-url' }).success, false);
  assert.equal(courseCreateSchema.safeParse(base).success, true);
  assert.equal(courseUpdateSchema.safeParse({ outlineUrl: OUTLINE_URL }).success, true);
  assert.equal(courseUpdateSchema.safeParse({ outlineUrl: 'not-a-url' }).success, false);
  assert.equal(courseUpdateSchema.safeParse({ outlineUrl: null }).success, true);
});

// --- CourseCard showPrice -------------------------------------------------

function cardCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'course-1', slug: 'py-crash', title: 'Python Crash Course Batch 09', description: 'Intro',
    longDescription: 'Long', thumbnail: '/t.png', category: 'Web Development', level: 'beginner',
    price: 1500, isFree: false, instructorId: 'inst-1', zoomLink: '', status: 'published',
    isFeatured: true, isCompleted: false,
    modules: [{ id: 'mod-1', title: 'Intro', lessons: [] }],
    requirements: [], whatYouLearn: [], tags: [], enrolledCount: 3, rating: 4.5, reviewCount: 2,
    createdAt: '2024-04-01', updatedAt: '2024-04-01', outlineUrl: OUTLINE_URL,
    ...overrides,
  };
}

function renderCard(props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(CourseCard, { course: cardCourse(), instructorName: 'Usman', ...props }),
  );
}

test('CourseCard shows the price by default', () => {
  const html = renderCard();
  assert.match(html, /PKR 1,500/);
  assert.match(html, /Enroll Now/);
});

test('CourseCard with showPrice={false} hides the price but keeps the Enroll button', () => {
  const html = renderCard({ showPrice: false });
  assert.doesNotMatch(html, /PKR 1,500/);
  assert.match(html, /Enroll Now/);
});

test('home-page featured courses pass showPrice={false} (fee hidden on the home page)', () => {
  const src = read('components/sections/featured-courses-client.tsx');
  assert.match(src, /showPrice=\{false\}/);
});

test('courses listing and wishlist keep the default (price shown)', () => {
  const listing = read('app/courses/courses-client.tsx');
  const wishlist = read('app/student/wishlist/student-wishlist-client.tsx');
  assert.doesNotMatch(listing, /showPrice/);
  assert.doesNotMatch(wishlist, /showPrice/);
});
