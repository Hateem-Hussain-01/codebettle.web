/**
 * Course urlKey regression tests — opaque instructor-portal key.
 *
 * Eman (14 Nov ~22:39 PKT): even with a direct URL, opening another
 * instructor's course must error, and the course key should be hashed /
 * opaque so the course id cannot be used at all.
 *
 * The fix: every course carries a random 48-hex urlKey, unrelated to its
 * id. Instructor pages and API routes resolve the URL param as a urlKey
 * ONLY — a raw course id 404s, another instructor's key 403s (404 on the
 * page), the owning instructor's key works. The ownership check stays as
 * the second layer (defense in depth). Public/student surfaces never see
 * the key (toPublicCourse strips it).
 *
 * Runs on the fake db + direct route-handler invocation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { getCourseByUrlKey, getCoursesByInstructor } from '../lib/db/courses';
import { toPublicCourse } from '../lib/db/mappers';
import {
  createCourseService,
  generateCourseUrlKey,
  loadCourseForEditByUrlKey,
} from '../lib/services/course-service';
import { PATCH as patchInstructorCourse } from '../app/api/instructor/courses/[id]/route';
import { POST as postInstructorModule } from '../app/api/instructor/courses/[id]/modules/route';
import { PATCH as patchInstructorLesson } from '../app/api/instructor/courses/[id]/modules/[moduleId]/lessons/[lessonId]/route';
import { POST as postInstructorAnnouncement } from '../app/api/instructor/announcements/route';
import { createModuleService, createLessonService } from '../lib/services/course-service';
import type { Actor } from '../lib/services/errors';
import type { SessionUser } from '../lib/services/auth-service';

const D = (s: string) => new Date(s);

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };
const INST1: Actor = { id: 'inst-1', role: 'instructor', name: 'Usman' };
const INST2: Actor = { id: 'inst-2', role: 'instructor', name: 'Fatima' };

const INST1_SESSION: SessionUser = { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', role: 'instructor' };
const INST2_SESSION: SessionUser = { id: 'inst-2', name: 'Fatima', email: 'fatima@codebettle.com', role: 'instructor' };

// 48 lowercase hex chars each (the shape generateCourseUrlKey produces).
const KEY1 = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
const KEY2 = 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1';

const HEX48 = /^[0-9a-f]{48}$/;

let fake: FakeDb;

function course(id: string, instructorId: string, urlKey: string) {
  return {
    id, slug: id, title: id, description: 'Intro', longDescription: 'Long',
    thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
    instructorId, zoomLink: 'https://zoom.example.com/1', schedule: null, status: 'published',
    isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
    tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
    certificateTemplateHtml: null, outlineUrl: null, urlKey,
    createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
  };
}

function seedBase() {
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-2', name: 'Fatima', email: 'fatima@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [course('course-1', 'inst-1', KEY1), course('course-2', 'inst-2', KEY2)]);
}

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedBase();
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ─── Key generation ─────────────────────────────────────────────────────────

test('URLKEY-GEN: generated keys are 48 lowercase hex chars, all distinct, never equal to a course id', () => {
  const keys = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const key = generateCourseUrlKey();
    assert.match(key, HEX48, key);
    assert.ok(!keys.has(key), `duplicate key generated: ${key}`);
    keys.add(key);
    assert.notEqual(key, 'course-1');
    assert.notEqual(key, 'course-2');
  }
  assert.equal(keys.size, 500);
});

// ─── Resolution ─────────────────────────────────────────────────────────────

test('URLKEY-RESOLVE: getCourseByUrlKey finds by key and returns null for a raw id or an unknown key', async () => {
  const found = await getCourseByUrlKey(KEY1);
  assert.ok(found, 'own key must resolve');
  assert.equal(found.id, 'course-1');
  assert.equal(found.urlKey, KEY1);

  // A raw course id is not a key — it must match nothing.
  assert.equal(await getCourseByUrlKey('course-1'), null);
  assert.equal(await getCourseByUrlKey('course-2'), null);
  // An unknown 48-hex key matches nothing either.
  assert.equal(await getCourseByUrlKey('0'.repeat(48)), null);
  // A short predictable string matches nothing.
  assert.equal(await getCourseByUrlKey('abc'), null);
});

test('URLKEY-GATE: raw id → 404; another instructor\'s key → 403; own key → course; admin with any key → course', async () => {
  const rawId = await loadCourseForEditByUrlKey(INST1, 'course-1');
  assert.ok('error' in rawId && rawId.status === 404, JSON.stringify(rawId));

  const other = await loadCourseForEditByUrlKey(INST1, KEY2);
  assert.ok('error' in other && other.status === 403, JSON.stringify(other));

  const own = await loadCourseForEditByUrlKey(INST1, KEY1);
  assert.ok('course' in own, JSON.stringify(own));
  assert.equal(own.course.id, 'course-1');

  const admin = await loadCourseForEditByUrlKey(ADMIN, KEY2);
  assert.ok('course' in admin, JSON.stringify(admin));
  assert.equal(admin.course.id, 'course-2');

  const missing = await loadCourseForEditByUrlKey(INST1, '0'.repeat(48));
  assert.ok('error' in missing && missing.status === 404, JSON.stringify(missing));
});

// ─── Creation ───────────────────────────────────────────────────────────────

test('URLKEY-CREATE: createCourseService assigns a fresh urlKey (48 hex, ≠ id, ≠ slug); two courses get different keys', async () => {
  const input = {
    slug: 'new-course', title: 'New Course', description: 'Intro', longDescription: 'Long',
    thumbnail: '/t.png', category: 'Web Development' as const, level: 'beginner' as const,
    price: 1500, instructorId: 'inst-1',
  };
  const first = await createCourseService(ADMIN, input);
  assert.ok('course' in first, JSON.stringify(first));
  assert.match(first.course.urlKey ?? '', HEX48);
  assert.notEqual(first.course.urlKey, first.course.id);
  assert.notEqual(first.course.urlKey, first.course.slug);

  // The key resolves back to the new course.
  const resolved = await getCourseByUrlKey(first.course.urlKey as string);
  assert.ok(resolved && resolved.id === first.course.id);

  const second = await createCourseService(ADMIN, { ...input, slug: 'new-course-2', title: 'New Course 2' });
  assert.ok('course' in second, JSON.stringify(second));
  assert.notEqual(second.course.urlKey, first.course.urlKey);
});

test('URLKEY-RETRY: a urlKey unique-constraint collision is retried with a fresh key instead of failing', async () => {
  // Simulate the DB reporting a duplicate key on the FIRST Course.create
  // (the fake db enforces no uniqueness itself). The service must catch
  // the urlKey collision, regenerate, and succeed on the next attempt.
  const origPublic = fake.orm.public;
  let threw = false;
  fake.orm.public = new Proxy(origPublic, {
    get(target, model: string) {
      const coll = (target as Record<string, unknown>)[model] as {
        create: (data: unknown) => Promise<unknown>;
      };
      if (model !== 'Course') return coll;
      return new Proxy(coll, {
        get(collTarget, prop: string) {
          if (prop === 'create') {
            return async (data: unknown) => {
              if (!threw) {
                threw = true;
                throw new Error('duplicate key value violates unique constraint "Course_urlKey_key"');
              }
              return collTarget.create(data);
            };
          }
          const value = (collTarget as unknown as Record<string, unknown>)[prop];
          return typeof value === 'function'
            ? (value as (...args: unknown[]) => unknown).bind(collTarget)
            : value;
        },
      });
    },
  });
  const created = await createCourseService(ADMIN, {
    slug: 'retry-course', title: 'Retry Course', description: 'Intro', longDescription: 'Long',
    thumbnail: '/t.png', category: 'Web Development', level: 'beginner',
    price: 1500, instructorId: 'inst-1',
  });
  assert.ok(threw, 'the first create must have hit the simulated collision');
  assert.ok('course' in created, JSON.stringify(created));
  assert.match(created.course.urlKey ?? '', HEX48);
});

// ─── Instructor routes ──────────────────────────────────────────────────────

test('URLKEY-ROUTE-PATCH: PATCH /api/instructor/courses/[id] — raw id → 404; other instructor\'s key → 403; own key → 200', async () => {
  __setTestSession(INST1_SESSION);
  const raw = await patchInstructorCourse(
    jsonReq('http://x/api/instructor/courses/course-1', 'PATCH', { title: 'Hacked' }),
    { params: Promise.resolve({ id: 'course-1' }) },
  );
  assert.equal(raw.status, 404);

  const other = await patchInstructorCourse(
    jsonReq(`http://x/api/instructor/courses/${KEY2}`, 'PATCH', { title: 'Hacked' }),
    { params: Promise.resolve({ id: KEY2 }) },
  );
  assert.equal(other.status, 403);

  const own = await patchInstructorCourse(
    jsonReq(`http://x/api/instructor/courses/${KEY1}`, 'PATCH', { title: 'Renamed by owner' }),
    { params: Promise.resolve({ id: KEY1 }) },
  );
  assert.equal(own.status, 200);
  const body = await own.json();
  assert.equal(body.course.title, 'Renamed by owner');
  assert.equal(body.course.id, 'course-1');
});

test('URLKEY-ROUTE-MODULES: POST /api/instructor/courses/[id]/modules — raw id → 404; own key → 201', async () => {
  __setTestSession(INST1_SESSION);
  const raw = await postInstructorModule(
    jsonReq('http://x/api/instructor/courses/course-1/modules', 'POST', { title: 'Module X' }),
    { params: Promise.resolve({ id: 'course-1' }) },
  );
  assert.equal(raw.status, 404);

  const own = await postInstructorModule(
    jsonReq(`http://x/api/instructor/courses/${KEY1}/modules`, 'POST', { title: 'Module A' }),
    { params: Promise.resolve({ id: KEY1 }) },
  );
  assert.equal(own.status, 201);
  const body = await own.json();
  assert.equal(body.module.title, 'Module A');
});

test('URLKEY-ROUTE-LESSON: PATCH lesson — raw id → 404; other instructor\'s key → 403; own key → 200', async () => {
  // Seed one module + lesson through the (id-based) services first.
  const mod = await createModuleService(INST1, 'course-1', { title: 'M1' });
  assert.ok('module' in mod, JSON.stringify(mod));
  const les = await createLessonService(INST1, 'course-1', mod.module.id, { title: 'L1' });
  assert.ok('lesson' in les, JSON.stringify(les));

  __setTestSession(INST1_SESSION);
  const raw = await patchInstructorLesson(
    jsonReq('http://x/api/instructor/courses/course-1/modules/x/lessons/y', 'PATCH', { title: 'Hacked' }),
    { params: Promise.resolve({ id: 'course-1', moduleId: mod.module.id, lessonId: les.lesson.id }) },
  );
  assert.equal(raw.status, 404);

  const other = await patchInstructorLesson(
    jsonReq(`http://x/api/instructor/courses/${KEY2}/modules/x/lessons/y`, 'PATCH', { title: 'Hacked' }),
    { params: Promise.resolve({ id: KEY2, moduleId: mod.module.id, lessonId: les.lesson.id }) },
  );
  assert.equal(other.status, 403);

  const own = await patchInstructorLesson(
    jsonReq(`http://x/api/instructor/courses/${KEY1}/modules/x/lessons/y`, 'PATCH', { title: 'Renamed lesson' }),
    { params: Promise.resolve({ id: KEY1, moduleId: mod.module.id, lessonId: les.lesson.id }) },
  );
  assert.equal(own.status, 200);
  const body = await own.json();
  assert.equal(body.lesson.title, 'Renamed lesson');
});

test('URLKEY-ANNOUNCE: POST /api/instructor/announcements — raw courseId → 404; other instructor\'s key → 403; own key → 201 with the real id stored', async () => {
  __setTestSession(INST1_SESSION);
  const raw = await postInstructorAnnouncement(
    jsonReq('http://x/api/instructor/announcements', 'POST', { title: 'Hi', content: 'Hello', courseId: 'course-1' }),
  );
  assert.equal(raw.status, 404);

  const other = await postInstructorAnnouncement(
    jsonReq('http://x/api/instructor/announcements', 'POST', { title: 'Hi', content: 'Hello', courseId: KEY2 }),
  );
  assert.equal(other.status, 403);

  const own = await postInstructorAnnouncement(
    jsonReq('http://x/api/instructor/announcements', 'POST', { title: 'Hi', content: 'Hello', courseId: KEY1 }),
  );
  assert.equal(own.status, 201);
  const body = await own.json();
  // The announcement stores the REAL course id as its FK — the key is
  // only the URL identifier, never stored anywhere else.
  assert.equal(body.announcement.courseId, 'course-1');
});

// ─── List data + public surface ─────────────────────────────────────────────

test('URLKEY-LIST-DATA: getCoursesByInstructor returns courses each carrying a urlKey (what the list page links with), never the raw id as the link', async () => {
  const mine = await getCoursesByInstructor('inst-1');
  assert.equal(mine.length, 1);
  assert.match(mine[0].urlKey ?? '', HEX48);
  assert.notEqual(mine[0].urlKey, mine[0].id);
  // The link the list page builds from this row is the key, not the id.
  assert.equal(`/instructor/courses/${mine[0].urlKey}`, `/instructor/courses/${KEY1}`);
});

test('URLKEY-PUBLIC: toPublicCourse strips the urlKey (and the Zoom link) — the public API must never leak the key', async () => {
  const full = await getCourseByUrlKey(KEY1);
  assert.ok(full);
  const pub = toPublicCourse(full);
  assert.ok(!('urlKey' in pub), 'public course must not carry urlKey');
  assert.ok(!('zoomLink' in pub), 'public course must not carry zoomLink');
  assert.equal(pub.id, 'course-1');
});

// ─── Migration backfill (artifact guard) ────────────────────────────────────

test('URLKEY-BACKFILL: the migration backfills one fresh random key per existing row, then requires + uniques the column', () => {
  const ops = JSON.parse(
    readFileSync(new URL('../migrations/app/20261114T1744_add_course_url_key/ops.json', import.meta.url), 'utf8'),
  ) as Array<{ id: string; execute?: Array<{ sql: string }> }>;
  const byId = new Map(ops.map((o) => [o.id, o]));

  assert.ok(byId.has('column.public.Course.urlKey'), 'add-column op missing');
  const backfill = byId.get('data_migration.backfill-Course-urlKey');
  assert.ok(backfill, 'backfill op missing');
  const backfillSql = backfill.execute?.map((e) => e.sql).join(' ') ?? '';
  // Per-row randomness (a VOLATILE expression evaluated per row), not a
  // constant: two UUIDs per row, hyphens stripped, first 48 hex kept,
  // only rows still holding NULL.
  assert.match(backfillSql, /gen_random_uuid\(\)/);
  assert.match(backfillSql, /WHERE "urlKey" IS NULL/);
  assert.doesNotMatch(backfillSql, /'([0-9a-f]{48})'/);

  assert.ok(byId.has('alterNullability.setNotNull.Course.urlKey'), 'SET NOT NULL op missing');
  const unique = byId.get('unique.Course.Course_urlKey_key');
  assert.ok(unique, 'unique-constraint op missing');
  assert.match(JSON.stringify(unique), /Course_urlKey_key/);
});
