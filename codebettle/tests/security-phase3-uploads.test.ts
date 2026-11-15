import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { __clearRateLimits } from '../lib/rate-limit';
import { createFakeDb, type FakeDb } from './fake-db';
import type { SessionUser } from '../lib/services/auth-service';
import { isUploadValidationError } from '../lib/services/file-validation';
import {
  __resetSuccessStoryStorageClient,
  __setSuccessStoryStorageClient,
  verifySuccessStoryFileContents,
} from '../lib/services/success-story-storage';
import { POST as avatarPost } from '../app/api/profile/avatar/route';
import { POST as paymentProofPost } from '../app/api/student/payments/upload/route';
import { POST as blogUploadPost } from '../app/api/admin/blog/upload/route';
import { POST as courseThumbnailPost } from '../app/api/admin/courses/[id]/thumbnail/route';
import { POST as courseThumbnailUploadPost } from '../app/api/admin/courses/thumbnail-upload/route';
import { POST as applicationUploadPost } from '../app/api/applications/upload/route';
import { POST as supportUploadPost } from '../app/api/student/requests/upload/route';
import { POST as formCoverPost } from '../app/api/admin/forms/[id]/cover/route';
import { POST as navbarLogoPost } from '../app/api/admin/navbar-editor/logo/route';
import { POST as pageBuilderUploadPost } from '../app/api/admin/page-builder/upload/route';
import { POST as reviewPhotoPost } from '../app/api/admin/reviews/photo/route';
import { POST as ceoPhotoPost } from '../app/api/admin/settings/ceo-photo/route';
import { POST as teamPhotoPost } from '../app/api/admin/success-stories-management/team/photo/route';
import { POST as videoSavePost } from '../app/api/admin/success-stories-management/video/route';

/**
 * Security Phase 3 — uploads group (U-5, U-6, U-7, U-3 upload part).
 * Every test proves the attack is blocked AND legitimate use still works.
 */

// Real magic bytes: a renamed text file must never pass as an image/video.
const TEXT_BYTES = new TextEncoder().encode('This is not an image at all, just plain text.').buffer as ArrayBuffer;
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x66, 0x61, 0x6b, 0x65]).buffer as ArrayBuffer;
const MP4_BYTES = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]).buffer as ArrayBuffer;

const D = (s: string) => new Date(s);
const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin', isAdmin: true };
const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };
const STU2: SessionUser = { id: 'stu-2', name: 'Sara', email: 'sara@example.com', role: 'student' };

/** Plain-text bytes declared as a PNG — the U-6 live probe file. */
function textAsPngForm(field: string): FormData {
  const form = new FormData();
  form.append(field, new File([TEXT_BYTES], 'fake.png', { type: 'image/png' }));
  return form;
}

function textAsPdfForm(field: string): FormData {
  const form = new FormData();
  form.append(field, new File([TEXT_BYTES], 'fake.pdf', { type: 'application/pdf' }));
  return form;
}

function postReq(url: string, form: FormData, ip?: string): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: form,
    headers: ip ? { 'x-forwarded-for': ip } : {},
  });
}

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function seedBaseDb(): FakeDb {
  const fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
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
  fake.seed('FormDefinition', [
    {
      id: 'form-1', name: 'Test Form', slug: 'test-form', type: 'General', description: null,
      schema: null, status: 'published', createdById: 'admin-1',
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  return fake;
}

// ---------------------------------------------------------------------------
// Mock success-story storage: list() reports the files below with their
// Storage metadata; createSignedUrl hands back a URL the fetch stub can
// resolve back to a path; remove() records deletions.
// ---------------------------------------------------------------------------

type StoryFile = { name: string; size: number; mimetype: string };

function storyStorageClient(filesByDir: Record<string, StoryFile[]>, removed: string[]): SupabaseClient {
  const client = {
    storage: {
      from: (bucket: string) => ({
        list: async (dir?: string) => ({
          data: (filesByDir[dir ?? ''] ?? []).map((f) => ({
            name: f.name,
            metadata: { size: f.size, mimetype: f.mimetype },
          })),
          error: null,
        }),
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` },
        }),
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=abc` },
          error: null,
        }),
        remove: async (paths: string[]) => {
          removed.push(...paths);
          return { data: [], error: null };
        },
      }),
    },
  };
  return client as unknown as SupabaseClient;
}

/** Fetch stub: returns the bytes the "uploaded" object actually holds, by path. */
function stubFetch(bytesByPath: (path: string) => ArrayBuffer) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const path = decodeURIComponent(new URL(url).pathname.replace(/^.*\/object\/sign\/[^/]+\//, ''));
    return new Response(bytesByPath(path));
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test.beforeEach(() => {
  __clearRateLimits();
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
  __resetSuccessStoryStorageClient();
  __clearRateLimits();
});

// ---------------------------------------------------------------------------
// U-7 — verifySuccessStoryFileContents fails closed on a missing MIME.
// ---------------------------------------------------------------------------

test('U-7: verifySuccessStoryFileContents with an undefined MIME is rejected (fail-closed)', async () => {
  const result = await verifySuccessStoryFileContents('success-stories', 'videos/x.mp4', undefined);
  assert.equal(result, 'unavailable');
});

test('U-7: verifySuccessStoryFileContents with a null MIME is rejected (fail-closed)', async () => {
  const result = await verifySuccessStoryFileContents('success-stories', 'videos/x.mp4', null);
  assert.equal(result, 'unavailable');
});

test('U-7: a genuine video still verifies (legitimate flow unbroken)', async () => {
  const removed: string[] = [];
  __setSuccessStoryStorageClient(storyStorageClient({}, removed));
  const restoreFetch = stubFetch(() => MP4_BYTES);
  try {
    const result = await verifySuccessStoryFileContents('success-stories', 'videos/real.mp4', 'video/mp4');
    assert.equal(result, 'ok');
    assert.equal(removed.length, 0);
  } finally {
    restoreFetch();
  }
});

test('U-7: text bytes claimed as video/mp4 are a mismatch', async () => {
  const removed: string[] = [];
  __setSuccessStoryStorageClient(storyStorageClient({}, removed));
  const restoreFetch = stubFetch(() => TEXT_BYTES);
  try {
    const result = await verifySuccessStoryFileContents('success-stories', 'videos/fake.mp4', 'video/mp4');
    assert.equal(result, 'mismatch');
  } finally {
    restoreFetch();
  }
});

// ---------------------------------------------------------------------------
// U-5 — admin page-video save runs the NEW-2 byte verification.
// ---------------------------------------------------------------------------

test('U-5: admin video save rejects a renamed file (text bytes as video/mp4) and deletes it', async () => {
  seedBaseDb();
  const removed: string[] = [];
  __setSuccessStoryStorageClient(
    storyStorageClient({ videos: [{ name: 'fake.mp4', size: 49, mimetype: 'video/mp4' }] }, removed),
  );
  const restoreFetch = stubFetch(() => TEXT_BYTES);
  __setTestSession(ADMIN);
  try {
    const res = await videoSavePost(jsonReq('http://localhost/api/admin/success-stories-management/video', { path: 'videos/fake.mp4' }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /do not match/);
    assert.ok(removed.includes('videos/fake.mp4'), `removed: ${removed.join(',')}`);
  } finally {
    restoreFetch();
  }
});

test('U-5: admin video save accepts a genuine video (legitimate flow unbroken)', async () => {
  seedBaseDb();
  const removed: string[] = [];
  __setSuccessStoryStorageClient(
    storyStorageClient({ videos: [{ name: 'real.mp4', size: 1024, mimetype: 'video/mp4' }] }, removed),
  );
  const restoreFetch = stubFetch(() => MP4_BYTES);
  __setTestSession(ADMIN);
  try {
    const res = await videoSavePost(jsonReq('http://localhost/api/admin/success-stories-management/video', { path: 'videos/real.mp4' }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { videoUrl: string; path: string };
    assert.match(body.videoUrl, /videos\/real\.mp4/);
    assert.equal(body.path, 'videos/real.mp4');
    assert.equal(removed.length, 0);
  } finally {
    restoreFetch();
  }
});

// ---------------------------------------------------------------------------
// U-6 — magic-byte mismatch is a 400 with the validation message, not a 500.
// ---------------------------------------------------------------------------

test('U-6: isUploadValidationError matches the validation messages and nothing else', () => {
  assert.equal(isUploadValidationError('The file contents do not match its type (image/png) — a renamed file is not accepted'), true);
  assert.equal(isUploadValidationError('The file is empty'), true);
  assert.equal(isUploadValidationError('The file could not be read'), true);
  assert.equal(isUploadValidationError('The file size could not be read'), true);
  assert.equal(isUploadValidationError('Only JPG, PNG, WebP or GIF images are allowed'), false);
  assert.equal(isUploadValidationError('Photo upload failed'), false);
  assert.equal(isUploadValidationError(''), false);
});

test('U-6: text-as-PNG avatar upload is 400 with the validation message (not 500)', async () => {
  seedBaseDb();
  __setTestSession(STU1);
  const res = await avatarPost(postReq('http://localhost/api/profile/avatar', textAsPngForm('avatar')));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contents do not match/);
});

test('U-6: text-as-PNG payment-proof upload is 400 with the validation message (not 500)', async () => {
  seedBaseDb();
  __setTestSession(STU1);
  const res = await paymentProofPost(postReq('http://localhost/api/student/payments/upload', textAsPngForm('file')));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contents do not match/);
});

test('U-6: text-as-PDF blog upload is 400 with the validation message (not 500)', async () => {
  seedBaseDb();
  __setTestSession(ADMIN);
  const res = await blogUploadPost(postReq('http://localhost/api/admin/blog/upload', textAsPdfForm('file')));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contents do not match/);
});

test('U-6: text-as-PNG course thumbnail upload is 400 with the validation message (not 500)', async () => {
  seedBaseDb();
  __setTestSession(ADMIN);
  const res = await courseThumbnailPost(
    postReq('http://localhost/api/admin/courses/course-1/thumbnail', textAsPngForm('thumbnail')),
    { params: Promise.resolve({ id: 'course-1' }) },
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contents do not match/);
});

test('U-6: text-as-PNG pre-create thumbnail upload is 400 with the validation message (not 500)', async () => {
  seedBaseDb();
  __setTestSession(ADMIN);
  const res = await courseThumbnailUploadPost(
    postReq('http://localhost/api/admin/courses/thumbnail-upload', textAsPngForm('thumbnail')),
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contents do not match/);
});

test('U-6: text-as-PDF application upload is 400 with the validation message (not 500)', async () => {
  seedBaseDb();
  const res = await applicationUploadPost(
    postReq('http://localhost/api/applications/upload', (() => {
      const form = textAsPdfForm('file');
      form.append('kind', 'cv');
      return form;
    })(), '10.0.0.1'),
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contents do not match/);
});

test('U-6: text-as-PDF support attachment upload is 400 with the validation message (not 500)', async () => {
  seedBaseDb();
  __setTestSession(STU1);
  const res = await supportUploadPost(
    postReq('http://localhost/api/student/requests/upload', textAsPdfForm('file'), '10.0.0.1'),
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contents do not match/);
});

test('U-6: text-as-PNG form cover upload is 400 with the validation message (not 500)', async () => {
  seedBaseDb();
  __setTestSession(ADMIN);
  const res = await formCoverPost(
    postReq('http://localhost/api/admin/forms/form-1/cover', textAsPngForm('cover')),
    { params: Promise.resolve({ id: 'form-1' }) },
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contents do not match/);
});

test('U-6: text-as-PNG navbar logo upload is 400 with the validation message (not 500)', async () => {
  seedBaseDb();
  __setTestSession(ADMIN);
  const res = await navbarLogoPost(
    postReq('http://localhost/api/admin/navbar-editor/logo', textAsPngForm('logo')),
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contents do not match/);
});

test('U-6: text-as-PNG page-builder image upload is 400 with the validation message (not 500)', async () => {
  seedBaseDb();
  __setTestSession(ADMIN);
  const form = textAsPngForm('image');
  form.append('pageId', 'test-page');
  const res = await pageBuilderUploadPost(
    postReq('http://localhost/api/admin/page-builder/upload', form),
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contents do not match/);
});

test('U-6: text-as-PNG review photo upload is 400 with the validation message (not 500)', async () => {
  seedBaseDb();
  __setTestSession(ADMIN);
  const res = await reviewPhotoPost(
    postReq('http://localhost/api/admin/reviews/photo', textAsPngForm('photo')),
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contents do not match/);
});

test('U-6: text-as-PNG CEO photo upload is 400 with the validation message (not 500)', async () => {
  seedBaseDb();
  __setTestSession(ADMIN);
  const res = await ceoPhotoPost(
    postReq('http://localhost/api/admin/settings/ceo-photo', textAsPngForm('photo')),
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contents do not match/);
});

test('U-6: text-as-PNG team member photo upload is 400 with the validation message (not 500)', async () => {
  seedBaseDb();
  __setTestSession(ADMIN);
  const res = await teamPhotoPost(
    postReq('http://localhost/api/admin/success-stories-management/team/photo', textAsPngForm('photo')),
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contents do not match/);
});

// ---------------------------------------------------------------------------
// U-3 — logged-in uploads are rate-limited per user.
// ---------------------------------------------------------------------------

test('U-3: 11th rapid avatar upload by one user is 429; another user is unaffected', async () => {
  seedBaseDb();
  __setTestSession(STU1);
  for (let i = 0; i < 10; i++) {
    const res = await avatarPost(postReq('http://localhost/api/profile/avatar', textAsPngForm('avatar')));
    // Each attempt is rejected for its bad bytes (400) but still counts
    // against the per-user upload budget.
    assert.equal(res.status, 400, `attempt ${i + 1} should be 400`);
  }
  const blocked = await avatarPost(postReq('http://localhost/api/profile/avatar', textAsPngForm('avatar')));
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error, /Too many/);

  // A different user has their own budget.
  __setTestSession(STU2);
  const other = await avatarPost(postReq('http://localhost/api/profile/avatar', textAsPngForm('avatar')));
  assert.equal(other.status, 400);
});

test('U-3: 11th rapid payment-proof upload by one user is 429; another user is unaffected', async () => {
  seedBaseDb();
  __setTestSession(STU1);
  for (let i = 0; i < 10; i++) {
    const res = await paymentProofPost(postReq('http://localhost/api/student/payments/upload', textAsPngForm('file')));
    assert.equal(res.status, 400, `attempt ${i + 1} should be 400`);
  }
  const blocked = await paymentProofPost(postReq('http://localhost/api/student/payments/upload', textAsPngForm('file')));
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error, /Too many/);

  __setTestSession(STU2);
  const other = await paymentProofPost(postReq('http://localhost/api/student/payments/upload', textAsPngForm('file')));
  assert.equal(other.status, 400);
});
