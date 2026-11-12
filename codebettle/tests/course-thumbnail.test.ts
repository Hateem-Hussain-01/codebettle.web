import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import type { SessionUser } from '../lib/services/auth-service';
import {
  COURSE_IMAGE_BUCKET,
  courseImagePathFromUrl,
  deleteCourseImage,
  getCourseImageStorageClient,
  uploadCourseImage,
} from '../lib/services/course-image-storage';
import { COURSE_THUMBNAIL_FALLBACK, isValidThumbnailUrl } from '../lib/thumbnail';

const D = (s: string) => new Date(s);

const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };

const PNG_BYTES = new TextEncoder().encode('fake png bytes').buffer as ArrayBuffer;

function mockClient(overrides: {
  upload?: () => Promise<{ data: { path: string } | null; error: { message: string } | null }>;
  remove?: () => Promise<{ error: { message: string } | null }>;
} = {}): SupabaseClient {
  const calls: { bucket: string; path?: string; body?: unknown }[] = [];
  const client = {
    __calls: calls,
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: unknown) => {
          calls.push({ bucket, path, body });
          if (overrides.upload) return overrides.upload();
          return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` },
        }),
        remove: async (paths: string[]) => {
          calls.push({ bucket, path: paths[0] });
          if (overrides.remove) return overrides.remove();
          return { data: [], error: null };
        },
      }),
    },
  };
  return client as unknown as SupabaseClient;
}

function seedCourseDb(): FakeDb {
  const fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: 'Long',
      thumbnail: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'draft',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 1, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  return fake;
}

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

test('isValidThumbnailUrl: accepts http(s), rejects everything else', () => {
  assert.equal(isValidThumbnailUrl('https://example.supabase.co/storage/v1/object/public/course-images/courses/c1/x.jpg'), true);
  assert.equal(isValidThumbnailUrl('http://example.com/t.png'), true);
  assert.equal(isValidThumbnailUrl('https://images.unsplash.com/photo-1?w=800&q=80'), true);
  assert.equal(isValidThumbnailUrl('javascript:alert(1)'), false);
  assert.equal(isValidThumbnailUrl('data:image/png;base64,abc'), false);
  assert.equal(isValidThumbnailUrl('ftp://example.com/t.png'), false);
  assert.equal(isValidThumbnailUrl('/t.png'), false);
  assert.equal(isValidThumbnailUrl('not-a-url'), false);
  assert.equal(isValidThumbnailUrl(''), false);
  assert.equal(isValidThumbnailUrl(null), false);
  assert.equal(isValidThumbnailUrl(undefined), false);
});

test('course thumbnail fallback is a self-contained image data URI', () => {
  assert.ok(COURSE_THUMBNAIL_FALLBACK.startsWith('data:image/svg+xml'), COURSE_THUMBNAIL_FALLBACK.slice(0, 40));
  assert.ok(COURSE_THUMBNAIL_FALLBACK.includes('CodeBettle'));
});

// ---------------------------------------------------------------------------
// Storage service (mock client — no live upload)
// ---------------------------------------------------------------------------

test('upload sends the image to the course-images bucket and returns url + path', async () => {
  const client = mockClient();
  const result = await uploadCourseImage(
    'course-1',
    { name: 'thumb.png', type: 'image/png', size: PNG_BYTES.byteLength, arrayBuffer: PNG_BYTES },
    client,
  );
  assert.match(result.path, /^courses\/course-1\/[0-9a-f-]+\.png$/);
  assert.ok(result.url.includes(COURSE_IMAGE_BUCKET), result.url);
  assert.ok(result.url.endsWith(result.path), result.url);
  const calls = (client as unknown as { __calls: { bucket: string; path?: string }[] }).__calls;
  assert.equal(calls[0].bucket, 'course-images');
  assert.equal(calls[0].path, result.path);
});

test('upload accepts a lazy arrayBuffer function and a pending course id (create flow)', async () => {
  const result = await uploadCourseImage(
    'pending',
    { name: 'thumb.jpg', type: 'image/jpeg', size: PNG_BYTES.byteLength, arrayBuffer: async () => PNG_BYTES },
    mockClient(),
  );
  assert.match(result.path, /^courses\/pending\/[0-9a-f-]+\.jpg$/);
});

test('upload rejects non-image files and oversized files before any storage call', async () => {
  const client = mockClient();
  await assert.rejects(
    uploadCourseImage('course-1', { name: 'notes.pdf', type: 'application/pdf', size: 100, arrayBuffer: PNG_BYTES }, client),
    /Only JPG, PNG, WebP or GIF/,
  );
  await assert.rejects(
    uploadCourseImage('course-1', { name: 'big.png', type: 'image/png', size: 6 * 1024 * 1024, arrayBuffer: PNG_BYTES }, client),
    /5 MB or smaller/,
  );
  const calls = (client as unknown as { __calls: unknown[] }).__calls;
  assert.equal(calls.length, 0);
});

test('upload surfaces a storage failure and delete removes by path', async () => {
  const failing = mockClient({ upload: async () => ({ data: null, error: { message: 'Bucket not found' } }) });
  await assert.rejects(
    uploadCourseImage('course-1', { name: 'thumb.png', type: 'image/png', size: PNG_BYTES.byteLength, arrayBuffer: PNG_BYTES }, failing),
    /Bucket not found/,
  );

  const client = mockClient();
  await deleteCourseImage('courses/course-1/abc.png', client);
  const calls = (client as unknown as { __calls: { bucket: string; path?: string }[] }).__calls;
  assert.equal(calls[0].bucket, 'course-images');
  assert.equal(calls[0].path, 'courses/course-1/abc.png');
});

test('courseImagePathFromUrl: only course-images URLs under courses/ resolve to a path', () => {
  assert.equal(
    courseImagePathFromUrl('https://example.supabase.co/storage/v1/object/public/course-images/courses/course-1/abc.jpg'),
    'courses/course-1/abc.jpg',
  );
  assert.equal(
    courseImagePathFromUrl('https://example.supabase.co/storage/v1/object/public/course-images/courses/pending/x.png?token=1'),
    'courses/pending/x.png',
  );
  // Seed Unsplash URLs and anything else must never be treated as deletable storage.
  assert.equal(courseImagePathFromUrl('https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80'), null);
  assert.equal(courseImagePathFromUrl('https://example.com/t.png'), null);
  assert.equal(courseImagePathFromUrl('/t.png'), null);
  assert.equal(courseImagePathFromUrl('https://example.supabase.co/storage/v1/object/public/avatars/user-1/a.jpg'), null);
  assert.equal(courseImagePathFromUrl('https://example.supabase.co/storage/v1/object/public/course-images/other/x.jpg'), null);
});

test('storage client getter names the missing env var', () => {
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    assert.throws(() => getCourseImageStorageClient(), /SUPABASE_SERVICE_ROLE_KEY/);
  } finally {
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  }
});

// ---------------------------------------------------------------------------
// Upload routes: RBAC, validation, missing-key 503
// ---------------------------------------------------------------------------

function pngForm(): FormData {
  const form = new FormData();
  form.append('thumbnail', new File([PNG_BYTES], 'thumb.png', { type: 'image/png' }));
  return form;
}

test('POST /api/admin/courses/[id]/thumbnail: 401 signed out, 403 student, 400 no file / wrong type', async () => {
  const route = await import('../app/api/admin/courses/[id]/thumbnail/route');
  seedCourseDb();

  __setTestSession(null);
  const anon = await route.POST(new NextRequest('http://localhost/api/admin/courses/course-1/thumbnail', { method: 'POST', body: pngForm() }), {
    params: Promise.resolve({ id: 'course-1' }),
  });
  assert.equal(anon.status, 401);

  __setTestSession(STU1);
  const student = await route.POST(new NextRequest('http://localhost/api/admin/courses/course-1/thumbnail', { method: 'POST', body: pngForm() }), {
    params: Promise.resolve({ id: 'course-1' }),
  });
  assert.equal(student.status, 403);

  __setTestSession(ADMIN);
  const empty = new FormData();
  const noFile = await route.POST(new NextRequest('http://localhost/api/admin/courses/course-1/thumbnail', { method: 'POST', body: empty }), {
    params: Promise.resolve({ id: 'course-1' }),
  });
  assert.equal(noFile.status, 400);
  assert.match((await noFile.json()).error, /image file is required/);

  const txt = new FormData();
  txt.append('thumbnail', new File(['hello'], 'notes.txt', { type: 'text/plain' }));
  const badType = await route.POST(new NextRequest('http://localhost/api/admin/courses/course-1/thumbnail', { method: 'POST', body: txt }), {
    params: Promise.resolve({ id: 'course-1' }),
  });
  assert.equal(badType.status, 400);
  assert.match((await badType.json()).error, /Only JPG, PNG, WebP or GIF/);
});

test('POST /api/admin/courses/[id]/thumbnail: 404 unknown course, 503 without a service-role key', async () => {
  const route = await import('../app/api/admin/courses/[id]/thumbnail/route');
  seedCourseDb();
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    __setTestSession(ADMIN);

    const missing = await route.POST(new NextRequest('http://localhost/api/admin/courses/nope/thumbnail', { method: 'POST', body: pngForm() }), {
      params: Promise.resolve({ id: 'nope' }),
    });
    assert.equal(missing.status, 404);

    const noKey = await route.POST(new NextRequest('http://localhost/api/admin/courses/course-1/thumbnail', { method: 'POST', body: pngForm() }), {
      params: Promise.resolve({ id: 'course-1' }),
    });
    assert.equal(noKey.status, 503);
    const body = await noKey.json();
    assert.match(body.error, /not configured/);
    assert.equal('stack' in body, false);
  } finally {
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  }
});

test('POST /api/admin/courses/thumbnail-upload: 401 signed out, 400 wrong type, 503 without a service-role key', async () => {
  const route = await import('../app/api/admin/courses/thumbnail-upload/route');
  seedCourseDb();
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';

    __setTestSession(null);
    const anon = await route.POST(new NextRequest('http://localhost/api/admin/courses/thumbnail-upload', { method: 'POST', body: pngForm() }));
    assert.equal(anon.status, 401);

    __setTestSession(ADMIN);
    const txt = new FormData();
    txt.append('thumbnail', new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    const badType = await route.POST(new NextRequest('http://localhost/api/admin/courses/thumbnail-upload', { method: 'POST', body: txt }));
    assert.equal(badType.status, 400);
    assert.match((await badType.json()).error, /Only JPG, PNG, WebP or GIF/);

    const noKey = await route.POST(new NextRequest('http://localhost/api/admin/courses/thumbnail-upload', { method: 'POST', body: pngForm() }));
    assert.equal(noKey.status, 503);
    assert.match((await noKey.json()).error, /not configured/);
  } finally {
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  }
});

// ---------------------------------------------------------------------------
// PATCH thumbnail URL validation (server-side schema)
// ---------------------------------------------------------------------------

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

test('PATCH /api/admin/courses/[id]: non-http(s) thumbnail is 400; https thumbnail saves', async () => {
  const route = await import('../app/api/admin/courses/[id]/route');
  seedCourseDb();
  __setTestSession(ADMIN);

  for (const bad of ['javascript:alert(1)', 'ftp://example.com/t.png', 'not-a-url', '/t.png']) {
    const res = await route.PATCH(jsonReq('http://localhost/api/admin/courses/course-1', 'PATCH', { thumbnail: bad }), {
      params: Promise.resolve({ id: 'course-1' }),
    });
    assert.equal(res.status, 400, `thumbnail ${bad} should be rejected`);
  }

  const good = await route.PATCH(jsonReq('http://localhost/api/admin/courses/course-1', 'PATCH', {
    thumbnail: 'https://example.supabase.co/storage/v1/object/public/course-images/courses/course-1/new.jpg',
  }), {
    params: Promise.resolve({ id: 'course-1' }),
  });
  assert.equal(good.status, 200);
  assert.equal(
    (await good.json()).course.thumbnail,
    'https://example.supabase.co/storage/v1/object/public/course-images/courses/course-1/new.jpg',
  );
});

// ---------------------------------------------------------------------------
// Wiring (source-level, same pattern as tests/phase6-design.test.ts)
// ---------------------------------------------------------------------------

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf-8');
}

test('edit page: admin course page renders the thumbnail section with upload + live preview', () => {
  const page = read('app/admin/courses/[id]/page.tsx');
  assert.match(page, /CourseThumbnailClient courseId=\{course\.id\} thumbnail=\{course\.thumbnail\}/);
  const client = read('app/admin/courses/[id]/course-thumbnail-client.tsx');
  assert.match(client, /CourseThumbnailUploader/);
  assert.match(client, /\/api\/admin\/courses\/\$\{courseId\}\/thumbnail/);
});

test('create form: no Thumbnail URL text field, no Unsplash fallback — upload supplies the thumbnail', () => {
  const form = read('app/admin/courses/new/new-course-client.tsx');
  assert.doesNotMatch(form, /Thumbnail URL/);
  assert.doesNotMatch(form, /images\.unsplash\.com/);
  assert.match(form, /CourseThumbnailUploader/);
  assert.match(form, /\/api\/admin\/courses\/thumbnail-upload/);
  assert.match(form, /isValidThumbnailUrl\(form\.thumbnail\)/);
  assert.match(form, /Upload a course thumbnail image first/);
});

test('render sites: every course thumbnail renders through CourseThumbnail (broken-image fallback)', () => {
  for (const file of [
    'components/ui/CourseCard.tsx',
    'app/courses/[slug]/course-detail-client.tsx',
    'app/admin/courses/courses-client.tsx',
    'app/instructor/courses/page.tsx',
    'app/instructor/students/page.tsx',
    'app/student/courses/page.tsx',
    'app/student/courses/[id]/page.tsx',
    'app/student/dashboard/page.tsx',
    'app/student/reviews/student-reviews-client.tsx',
  ]) {
    const src = read(file);
    assert.match(src, /CourseThumbnail/, `${file} must render thumbnails through CourseThumbnail`);
  }
  const card = read('components/ui/CourseCard.tsx');
  assert.doesNotMatch(card, /<img\s*\n?\s*src=\{course\.thumbnail\}/);
  assert.match(read('components/ui/CourseThumbnail.tsx'), /COURSE_THUMBNAIL_FALLBACK/);
});
