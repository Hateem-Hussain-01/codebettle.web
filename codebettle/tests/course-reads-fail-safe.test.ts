import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient, type DbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  createCourse,
  getAllCourses,
  getCourseById,
  getCourseBySlug,
  getCoursesByIds,
  getCoursesByInstructor,
  getFeaturedCourses,
  getPublishedCourses,
  listCourses,
} from '../lib/db/courses';

/**
 * Course reads fail-safe (Phase 2 migration gap).
 *
 * PR #22 added Course.certificateTemplateHtml, but the migration SQL is
 * run by hand in the Supabase SQL Editor — until it runs, the live table
 * has no such column and the generated client (which selects every
 * scalar) throws Postgres 42703. Every general course read must retry
 * with the pre-migration columns instead of crashing the page that
 * called it (the student dashboard calls getCoursesByIds).
 *
 * These tests simulate the missing column with a stub client that
 * throws 42703 on the full-column read and answers the legacy select.
 */

const D = (s: string) => new Date(s);

const missingColumnError = () =>
  Object.assign(new Error('column "public"."Course"."certificateTemplateHtml" does not exist'), {
    code: '42703',
  });

/** One course row as the pre-migration table would return it (no template column), with curriculum attached. */
const legacyCourseRow = {
  id: 'course-1',
  slug: 'web-101',
  title: 'Web 101',
  description: 'Intro',
  longDescription: 'Long',
  thumbnail: '/t.png',
  category: 'Web_Development',
  level: 'beginner',
  pricePkr: 5000,
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
  createdAt: D('2024-04-01'),
  updatedAt: D('2024-04-01'),
  modules: [
    {
      id: 'mod-1',
      courseId: 'course-1',
      title: 'Intro',
      position: 1,
      lessons: [
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
      ],
    },
  ],
};

const legacyCourseRow2 = {
  ...legacyCourseRow,
  id: 'course-2',
  slug: 'py-101',
  title: 'Python 101',
  isFeatured: false,
  modules: [],
};

/** A Lesson/Module collection for the include callback: orderBy/include are no-ops. */
function makeRelationChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.orderBy = () => chain;
  chain.include = (_name: string, fn?: (m: unknown) => unknown) => {
    if (fn) fn(makeRelationChain());
    return chain;
  };
  return chain;
}

/**
 * A Course collection that throws Postgres 42703 on the full-column read
 * (no .select) and answers the legacy (pre-migration columns) read.
 * Every method returns the same chain; the terminals check whether a
 * .select() happened first.
 */
function makeThrowingCourseCollection(legacyRows: Array<Record<string, unknown>>) {
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
    if (!selected) throw missingColumnError();
    return legacyRows[0] ?? null;
  };
  chain.all = async () => {
    if (!selected) throw missingColumnError();
    return legacyRows;
  };
  return chain;
}

function useThrowingClient(legacyRows: Array<Record<string, unknown>>) {
  const stub = {
    orm: { public: { Course: { where: () => makeThrowingCourseCollection(legacyRows) } } },
  };
  __setDbClient(stub as unknown as DbClient);
}

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('Course', [
    {
      id: 'course-1',
      slug: 'web-101',
      title: 'Web 101',
      description: 'Intro',
      longDescription: 'Long',
      thumbnail: '/t.png',
      category: 'Web_Development',
      level: 'beginner',
      pricePkr: 5000,
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
      certificateTemplateHtml: '<html>custom</html>',
      createdAt: D('2024-04-01'),
      updatedAt: D('2024-04-01'),
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
});

test.afterEach(() => {
  __resetDbClient();
});

test('getCourseById falls back to the legacy select when the migration has not run', async () => {
  useThrowingClient([legacyCourseRow]);
  const course = await getCourseById('course-1');
  assert.equal(course?.title, 'Web 101');
  assert.equal(course?.certificateTemplateHtml, null, 'missing column reads as no template');
  assert.equal(course?.modules.length, 1, 'curriculum still loads');
  assert.equal(course?.modules[0]?.lessons.length, 1);
});

test('getCoursesByIds (student dashboard path) returns the enrolled courses with template null', async () => {
  useThrowingClient([legacyCourseRow, legacyCourseRow2]);
  // Unknown ids are skipped, input order is kept — the dashboard relies on both.
  const courses = await getCoursesByIds(['course-2', 'missing', 'course-1']);
  assert.deepEqual(
    courses.map((c) => c.id),
    ['course-2', 'course-1'],
  );
  assert.ok(courses.every((c) => c.certificateTemplateHtml === null));
  assert.equal(courses[1]?.modules.length, 1);
});

test('getCourseBySlug falls back to the legacy select', async () => {
  useThrowingClient([legacyCourseRow]);
  const course = await getCourseBySlug('web-101');
  assert.equal(course?.id, 'course-1');
  assert.equal(course?.certificateTemplateHtml, null);
});

test('list reads (published / featured / by instructor / all) fall back to the legacy select', async () => {
  useThrowingClient([legacyCourseRow, legacyCourseRow2]);
  assert.deepEqual((await getPublishedCourses()).map((c) => c.id), ['course-1', 'course-2']);
  assert.deepEqual((await getFeaturedCourses()).map((c) => c.id), ['course-1', 'course-2']);
  assert.deepEqual((await getCoursesByInstructor('inst-1')).map((c) => c.id), ['course-1', 'course-2']);
  assert.deepEqual((await getAllCourses()).map((c) => c.id), ['course-1', 'course-2']);
  for (const c of await getAllCourses()) {
    assert.equal(c.certificateTemplateHtml, null);
  }
});

test('listCourses falls back for both the total count and the page items', async () => {
  useThrowingClient([legacyCourseRow, legacyCourseRow2]);
  const page = await listCourses({ limit: '10' });
  assert.equal(page.total, 2, 'total count survives the missing column');
  assert.deepEqual(page.items.map((c) => c.id), ['course-1', 'course-2']);
  assert.ok(page.items.every((c) => c.certificateTemplateHtml === null));
});

test('a non-42703 error still propagates instead of falling back', async () => {
  const stub = {
    orm: {
      public: {
        Course: {
          where: () => ({
            where: () => ({
              include: () => ({
                first: async (): Promise<never> => {
                  throw new Error('connection refused');
                },
              }),
              select: () => ({
                include: () => ({
                  first: async () => {
                    throw new Error('fallback must not run');
                  },
                }),
              }),
            }),
          }),
        },
      },
    },
  };
  __setDbClient(stub as unknown as DbClient);
  await assert.rejects(() => getCourseById('course-1'), /connection refused/);
});

test('when the column exists the template is returned (no behaviour change after the migration)', async () => {
  const course = await getCourseById('course-1');
  assert.equal(course?.certificateTemplateHtml, '<html>custom</html>');
  const byIds = await getCoursesByIds(['course-1']);
  assert.equal(byIds[0]?.certificateTemplateHtml, '<html>custom</html>');
  const page = await listCourses({ limit: '10' });
  assert.equal(page.items[0]?.certificateTemplateHtml, '<html>custom</html>');
});

test('createCourse without a template does not send the Phase 2 column', async () => {
  // A create that throws 42703 if the payload names the new column at all.
  const stub = {
    orm: {
      public: {
        Course: {
          create: async (data: Record<string, unknown>) => {
            if ('certificateTemplateHtml' in data) throw missingColumnError();
            return {
              ...data,
              id: 'course-new',
              status: 'draft',
              isFeatured: false,
              isCompleted: false,
              completedAt: null,
              requirements: [],
              whatYouLearn: [],
              tags: [],
              enrolledCount: 0,
              rating: 0,
              reviewCount: 0,
              createdAt: D('2024-04-01'),
              updatedAt: D('2024-04-01'),
            };
          },
        },
      },
    },
  };
  __setDbClient(stub as unknown as DbClient);
  const course = await createCourse({
    slug: 'new-101',
    title: 'New 101',
    description: 'Intro',
    longDescription: 'Long',
    thumbnail: '/t.png',
    category: 'Programming',
    level: 'beginner',
    pricePkr: 0,
    isFree: true,
    instructorId: 'inst-1',
  });
  assert.equal(course.slug, 'new-101');
  assert.equal(course.certificateTemplateHtml, null);
});

test('createCourse with a template still stores it (fake DB)', async () => {
  const course = await createCourse({
    slug: 'tmpl-101',
    title: 'Template 101',
    description: 'Intro',
    longDescription: 'Long',
    thumbnail: '/t.png',
    category: 'Programming',
    level: 'beginner',
    pricePkr: 0,
    isFree: true,
    instructorId: 'inst-1',
    certificateTemplateHtml: '<html>custom</html>',
  });
  assert.equal(course.certificateTemplateHtml, '<html>custom</html>');
});
