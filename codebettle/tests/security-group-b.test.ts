import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession, assertSameOrigin } from '../lib/api-helpers';
import { API_CSP, isSameOriginRequest } from '../lib/security';
import { createFakeDb, type FakeDb } from './fake-db';
import { getAuditLog } from '../lib/db/audit';
import { isValidColabUrl } from '../lib/assignments';
import {
  createAssignment,
  createSubmission,
  gradeSubmission,
  updateSubmission,
} from '../lib/db/assignments';
import { DELETE as deleteAssignmentRoute } from '../app/api/admin/assignments/[id]/route';
import { GET as instructorAssignmentsList } from '../app/api/instructor/assignments/route';
import { POST as pageBuilderUpload } from '../app/api/admin/page-builder/upload/route';
import { proxy } from '../proxy';
import {
  isValidStorageKeySegment,
  validateStorageKeySegment,
  validateUploadedBytes,
} from '../lib/services/file-validation';
import { uploadAvatar } from '../lib/services/avatar-storage';
import { uploadBlogPdf } from '../lib/services/blog-storage';
import { uploadCourseImage, uploadPageImage } from '../lib/services/course-image-storage';
import { uploadPaymentProof } from '../lib/services/payment-proof-storage';
import { uploadApplicationFile } from '../lib/services/application-storage';
import { uploadSupportRequestAttachment } from '../lib/services/support-request-service';
import {
  __resetSuccessStoryStorageClient,
  __setSuccessStoryStorageClient,
} from '../lib/services/success-story-storage';
import { submitSuccessStory } from '../lib/services/success-story-service';
import type { SuccessStorySubmitInput } from '../lib/success-story-validation';
import type { SessionUser } from '../lib/services/auth-service';

/**
 * Security Group B regression tests (uploads, CSRF, blog PDFs, audit
 * logging, delete bar, storage keys, CSP, role alignment, Colab
 * hardening). Every test proves the attack is blocked AND legitimate
 * use still works.
 */

// ---------------------------------------------------------------------------
// Real magic bytes (a renamed text file must never pass as an image/doc).
// ---------------------------------------------------------------------------

const TEXT_BYTES = new TextEncoder().encode('This is not an image at all, just plain text.').buffer as ArrayBuffer;
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x66, 0x61, 0x6b, 0x65]).buffer as ArrayBuffer;
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x66, 0x61, 0x6b, 0x65]).buffer as ArrayBuffer;
const GIF_BYTES = new TextEncoder().encode('GIF89afake').buffer as ArrayBuffer;
const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x0c, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x66, 0x61, 0x6b, 0x65]).buffer as ArrayBuffer;
const PDF_BYTES = new TextEncoder().encode('%PDF-1.4 fake pdf').buffer as ArrayBuffer;
const DOC_BYTES = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x66, 0x61, 0x6b, 0x65]).buffer as ArrayBuffer;
const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x66, 0x61, 0x6b, 0x65]).buffer as ArrayBuffer;
const MP4_BYTES = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]).buffer as ArrayBuffer;

const D = (s: string) => new Date(s);
const COLAB = 'https://colab.research.google.com/drive/1AbC2dEf3GhI4jKl5MnOp';

const FULL_ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin', isAdmin: true };
// Restricted admin: assignments area only — NOT a full admin.
const RESTRICTED_ADMIN: SessionUser = {
  id: 'admin-restricted', name: 'Restricted', email: 'r@codebettle.com', role: 'admin', isAdmin: true,
  adminPermissions: { assignments: true },
};
const INST1: SessionUser = { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', role: 'instructor', isTeacher: true };

// ---------------------------------------------------------------------------
// Generic mock Supabase client (records calls, never touches the network).
// ---------------------------------------------------------------------------

function mockStorageClient(): SupabaseClient {
  const calls: { bucket: string; method: string; path?: string }[] = [];
  const client = {
    __calls: calls,
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _body: unknown) => {
          calls.push({ bucket, method: 'upload', path });
          return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` },
        }),
        remove: async (paths: string[]) => {
          calls.push({ bucket, method: 'remove', path: paths[0] });
          return { data: [], error: null };
        },
        list: async (dir?: string) => {
          calls.push({ bucket, method: 'list', path: dir });
          return { data: [], error: null };
        },
        createSignedUrl: async (path: string) => {
          calls.push({ bucket, method: 'createSignedUrl', path });
          return { data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=abc` }, error: null };
        },
        createSignedUploadUrl: async (path: string) => {
          calls.push({ bucket, method: 'createSignedUploadUrl', path });
          return { data: { signedUrl: `https://example.supabase.co/storage/v1/object/upload/sign/${bucket}/${path}?token=abc`, token: 'abc' }, error: null };
        },
      }),
    },
  };
  return client as unknown as SupabaseClient;
}

function file(name: string, type: string, bytes: ArrayBuffer) {
  return { name, type, size: bytes.byteLength, arrayBuffer: bytes };
}

// ---------------------------------------------------------------------------
// UPLOAD-01 / NEW-4 — magic-byte validation on every upload helper.
// ---------------------------------------------------------------------------

test('UPLOAD-01: text bytes claimed as image/jpeg are rejected on every upload helper', async () => {
  const client = mockStorageClient();
  const textJpeg = file('evil.jpg', 'image/jpeg', TEXT_BYTES);
  await assert.rejects(uploadAvatar('user-1', textJpeg, client), /do not match|Only JPG/);
  await assert.rejects(uploadCourseImage('course-1', textJpeg, client), /do not match|Only JPG/);
  await assert.rejects(
    uploadBlogPdf(file('evil.pdf', 'application/pdf', TEXT_BYTES), client),
    /do not match|Only PDF/,
  );
  await assert.rejects(uploadPaymentProof(textJpeg, client), /do not match|Only PNG/);
  await assert.rejects(
    uploadApplicationFile('cv', file('evil.pdf', 'application/pdf', TEXT_BYTES), client),
    /do not match|Only PDF/,
  );
  await assert.rejects(
    uploadSupportRequestAttachment(file('evil.pdf', 'application/pdf', TEXT_BYTES), client),
    /do not match|Only PDF/,
  );
  // Nothing reached storage.
  assert.equal((client as unknown as { __calls: unknown[] }).__calls.length, 0);
});

test('UPLOAD-01: legitimate files with real magic bytes still upload on every helper', async () => {
  const client = mockStorageClient();
  const avatar = await uploadAvatar('user-1', file('me.jpg', 'image/jpeg', JPEG_BYTES), client);
  assert.match(avatar.path, /^user-1\/[0-9a-f-]+\.jpg$/);
  const thumb = await uploadCourseImage('course-1', file('thumb.png', 'image/png', PNG_BYTES), client);
  assert.match(thumb.path, /^courses\/course-1\/[0-9a-f-]+\.png$/);
  const gif = await uploadCourseImage('course-1', file('anim.gif', 'image/gif', GIF_BYTES), client);
  assert.ok(gif.path.endsWith('.gif'));
  const webp = await uploadCourseImage('course-1', file('pic.webp', 'image/webp', WEBP_BYTES), client);
  assert.ok(webp.path.endsWith('.webp'));
  const blog = await uploadBlogPdf(file('post.pdf', 'application/pdf', PDF_BYTES), client);
  assert.match(blog.path, /^blogs\/[0-9a-f-]+\.pdf$/);
  const proof = await uploadPaymentProof(file('proof.png', 'image/png', PNG_BYTES), client);
  assert.match(proof.path, /^payment-proofs\/[0-9a-f-]+\.png$/);
  const cv = await uploadApplicationFile('cv', file('cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', DOCX_BYTES), client);
  assert.ok(cv.path.endsWith('.docx'));
  const doc = await uploadApplicationFile('cv', file('cv.doc', 'application/msword', DOC_BYTES), client);
  assert.ok(doc.path.endsWith('.doc'));
  const demo = await uploadApplicationFile('demo', file('demo.mp4', 'video/mp4', MP4_BYTES), client);
  assert.ok(demo.path.endsWith('.mp4'));
  const att = await uploadSupportRequestAttachment(file('note.pdf', 'application/pdf', PDF_BYTES), client);
  assert.match(att.path, /^support-requests\/[0-9a-f-]+\.pdf$/);
});

test('UPLOAD-01: validateUploadedBytes rejects a MIME/extension mismatch and an empty file', () => {
  // PNG bytes claimed as JPEG: magic bytes contradict the MIME.
  assert.match(
    validateUploadedBytes('image/jpeg', PNG_BYTES.byteLength, Buffer.from(PNG_BYTES), ['image/jpeg', 'image/png'], 5 * 1024 * 1024, 'Only images', 'Too big') ?? '',
    /do not match/,
  );
  // Empty file.
  assert.match(
    validateUploadedBytes('image/png', 0, Buffer.alloc(0), ['image/png'], 5 * 1024 * 1024, 'Only images', 'Too big') ?? '',
    /empty/,
  );
  // Real PNG as PNG passes.
  assert.equal(
    validateUploadedBytes('image/png', PNG_BYTES.byteLength, Buffer.from(PNG_BYTES), ['image/png'], 5 * 1024 * 1024, 'Only images', 'Too big'),
    null,
  );
});

// ---------------------------------------------------------------------------
// NEW-2 — success-story signed uploads: bytes verified at submit time.
// ---------------------------------------------------------------------------

const STORY_FILES: Record<string, { name: string; size: number; mimetype: string }[]> = {
  profiles: [{ name: 'test-photo.jpg', size: 1200, mimetype: 'image/jpeg' }],
  evidence: [{ name: 'cert.pdf', size: 5000, mimetype: 'application/pdf' }],
};

function storyStorageClient(removed: string[]): SupabaseClient {
  const client = {
    storage: {
      from: (bucket: string) => ({
        list: async (dir?: string) => ({
          data: (STORY_FILES[dir ?? ''] ?? []).map((f) => ({
            name: f.name,
            metadata: { size: f.size, mimetype: f.mimetype },
          })),
          error: null,
        }),
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` },
        }),
        createSignedUploadUrl: async (path: string) => ({
          data: { signedUrl: `https://example.supabase.co/storage/v1/object/upload/sign/${bucket}/${path}?token=abc`, token: 'abc' },
          error: null,
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

function storyPayload(overrides: Partial<SuccessStorySubmitInput> = {}): SuccessStorySubmitInput {
  return {
    fullName: 'Ayesha Khan',
    email: 'ayesha@example.com',
    profilePicturePath: 'profiles/test-photo.jpg',
    country: 'Pakistan',
    city: 'Faisalabad',
    designation: 'Junior Software Engineer',
    linkedinUrl: 'https://www.linkedin.com/in/ayesha-khan',
    courseId: 'course-1',
    courseTitle: 'Python Crash Course',
    batchId: 'batch-8',
    batchNumber: 8,
    joinedAt: '2026-01-15',
    instructorName: 'Ahmad Hassan',
    skillsLearned: 'Python, Django, React',
    experience: 'Hands-on projects every week and great feedback.',
    story: 'I went from zero programming knowledge to a full-time software job in eight months.',
    beforeJoining: 'I was a university student with no coding background.',
    challenges: 'Balancing university with the course.',
    howHelped: 'The projects and mentor support made the difference.',
    achievementsAfter: 'Got an internship, then a full-time offer.',
    biggestAchievement: 'Landing my first software job.',
    advice: 'Be consistent — one hour a day adds up.',
    consentPublication: true,
    consentMedia: true,
    consentAccuracy: true,
    consentContact: false,
    achievements: [
      {
        category: 'job',
        title: 'Junior Software Engineer at TechCorp',
        organization: 'TechCorp',
        description: 'Full-time role after the course.',
        achievedAt: '2026-09-01',
        evidence: [
          { kind: 'file', url: 'evidence/cert.pdf', label: 'Offer letter', fileName: 'cert.pdf', mime: 'application/pdf', size: 5000 },
          { kind: 'link', url: 'https://github.com/ayesha/project', label: 'Final project' },
        ],
      },
    ],
    idempotencyKey: `test-key-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
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

test('NEW-2: a signed upload of text bytes claimed as image/jpeg is rejected at submit and the object is deleted', async () => {
  const fake = createFakeDb();
  __setDbClient(fake.asClient());
  const removed: string[] = [];
  __setSuccessStoryStorageClient(storyStorageClient(removed));
  // The attacker PUT text bytes to the signed URL; the metadata still
  // claims image/jpeg (the Content-Type from the PUT).
  const restoreFetch = stubFetch(() => TEXT_BYTES);
  try {
    const result = await submitSuccessStory(storyPayload(), null);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.error ?? '', /contents do not match/);
    // The bad object was deleted so it never lingers in the bucket.
    assert.ok(removed.includes('profiles/test-photo.jpg'), `removed: ${removed.join(',')}`);
  } finally {
    restoreFetch();
    __resetDbClient();
    __resetSuccessStoryStorageClient();
  }
});

test('NEW-2: a genuine JPEG profile picture + PDF evidence still submits', async () => {
  const fake = createFakeDb();
  __setDbClient(fake.asClient());
  const removed: string[] = [];
  __setSuccessStoryStorageClient(storyStorageClient(removed));
  const restoreFetch = stubFetch((path) => (path.endsWith('.pdf') ? PDF_BYTES : JPEG_BYTES));
  try {
    const result = await submitSuccessStory(storyPayload(), null);
    assert.equal(result.ok, true, result.ok ? undefined : result.error);
    assert.equal(removed.length, 0);
  } finally {
    restoreFetch();
    __resetDbClient();
    __resetSuccessStoryStorageClient();
  }
});

// ---------------------------------------------------------------------------
// NEW-5 — CSRF: same-origin check on state-changing API requests.
// ---------------------------------------------------------------------------

function originReq(url: string, origin?: string | null, referer?: string | null) {
  return {
    url,
    headers: {
      get: (name: string) => {
        if (name === 'origin') return origin ?? null;
        if (name === 'referer') return referer ?? null;
        return null;
      },
    },
  };
}

test('NEW-5: isSameOriginRequest allows same-origin and header-less requests, blocks cross-origin and "null"', () => {
  const api = 'https://codebettle-web.vercel.app/api/admin/assignments/x';
  assert.equal(isSameOriginRequest(originReq(api, 'https://codebettle-web.vercel.app')), true);
  assert.equal(isSameOriginRequest(originReq(api, 'https://evil.example.com')), false);
  assert.equal(isSameOriginRequest(originReq(api, 'https://codebettle-web.vercel.app.evil.example.com')), false);
  assert.equal(isSameOriginRequest(originReq(api)), true); // curl / server fetch
  assert.equal(isSameOriginRequest(originReq(api, 'null')), false);
  // Referer fallback when Origin is absent.
  assert.equal(isSameOriginRequest(originReq(api, undefined, 'https://codebettle-web.vercel.app/admin')), true);
  assert.equal(isSameOriginRequest(originReq(api, undefined, 'https://evil.example.com/x')), false);
  // Preview deployments: the app's own preview origin passes.
  assert.equal(
    isSameOriginRequest(originReq('https://codebettle-web-git-x.vercel.app/api/x', 'https://codebettle-web-git-x.vercel.app')),
    true,
  );
});

test('NEW-5: assertSameOrigin returns 403 for a cross-origin mutation and null for same-origin', async () => {
  const cross = new NextRequest('http://localhost/api/admin/assignments/x', {
    method: 'DELETE',
    headers: { Origin: 'https://evil.example.com' },
  });
  const denied = assertSameOrigin(cross);
  assert.ok(denied);
  assert.equal(denied.status, 403);
  assert.match((await denied.json()).error, /Cross-origin/);

  const same = new NextRequest('http://localhost/api/admin/assignments/x', {
    method: 'DELETE',
    headers: { Origin: 'http://localhost' },
  });
  assert.equal(assertSameOrigin(same), null);

  const noHeaders = new NextRequest('http://localhost/api/admin/assignments/x', { method: 'DELETE' });
  assert.equal(assertSameOrigin(noHeaders), null);
});

test('NEW-5 + NEW-10: the proxy rejects a cross-origin API mutation with CSP headers and passes a same-origin GET with CSP', async () => {
  const cross = await proxy(
    new NextRequest('http://localhost/api/admin/assignments/x', {
      method: 'DELETE',
      headers: { Origin: 'https://evil.example.com' },
    }),
  );
  assert.equal(cross.status, 403);
  assert.match(cross.headers.get('Content-Security-Policy') ?? '', /default-src 'none'/);
  assert.equal(cross.headers.get('X-Frame-Options'), 'DENY');

  const same = await proxy(new NextRequest('http://localhost/api/courses', { method: 'GET' }));
  assert.equal(same.status, 200);
  assert.match(same.headers.get('Content-Security-Policy') ?? '', /default-src 'none'; frame-ancestors 'none'; sandbox/);
  assert.equal(same.headers.get('X-Frame-Options'), 'DENY');

  const staticRes = await proxy(new NextRequest('http://localhost/_next/static/chunks/app.js', { method: 'GET' }));
  assert.equal(staticRes.status, 200);
  assert.match(staticRes.headers.get('Content-Security-Policy') ?? '', /default-src 'none'/);
});

test('NEW-10: the API CSP is restrictive — nothing loads, nothing frames, sandboxed', () => {
  assert.equal(API_CSP, "default-src 'none'; frame-ancestors 'none'; sandbox");
});

// ---------------------------------------------------------------------------
// NEW-7 — assignment grading is audit-logged, re-grades included.
// ---------------------------------------------------------------------------

let fake: FakeDb;

function seedAssignmentsBase() {
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'python', title: 'Python Crash Course', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Programming', level: 'beginner', pricePkr: 1500, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
    {
      id: 'course-2', slug: 'web', title: 'Web Dev', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Programming', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-2', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('User', [
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-2', name: 'Sara', email: 'sara@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Batch', [
    { id: 'batch-8', courseId: 'course-1', batchNumber: 8, status: 'ongoing', startDate: D('2026-10-01'), endDate: null, capacity: 30, instructorId: 'inst-1', createdAt: D('2026-09-01'), updatedAt: D('2026-09-01') },
    { id: 'batch-9', courseId: 'course-2', batchNumber: 9, status: 'ongoing', startDate: D('2026-10-01'), endDate: null, capacity: 30, instructorId: 'inst-2', createdAt: D('2026-09-01'), updatedAt: D('2026-09-01') },
  ]);
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

test('NEW-7: grade then re-grade writes both audit entries with old vs new marks', async () => {
  seedAssignmentsBase();
  const assignment = await createAssignment({
    courseId: 'course-1', batchId: 'batch-8', title: 'Spam classifier',
    description: 'Train a spam classifier.', dueDate: null, maxMarks: 100, createdBy: 'inst-1',
  });
  const submission = await createSubmission({
    assignmentId: assignment.id, studentId: 'stu-1', colabUrl: COLAB, status: 'submitted',
  });
  await gradeSubmission(submission.id, { marks: 85, feedback: 'Well done', gradedBy: 'inst-1' });
  await gradeSubmission(submission.id, { marks: 90, feedback: 'Even better', gradedBy: 'inst-1' });

  const entries = await getAuditLog();
  const grade = entries.find((e) => e.action === 'assignment.grade' && e.entityId === submission.id);
  const regrade = entries.find((e) => e.action === 'assignment.regrade' && e.entityId === submission.id);
  assert.ok(grade, 'first grade must be audit-logged');
  assert.equal(grade.actorId, 'inst-1');
  assert.ok(regrade, 're-grade must be audit-logged as its own entry');
  assert.match(regrade.detail ?? '', /85 marks -> 90 marks/);
});

// ---------------------------------------------------------------------------
// NEW-8 — assignment delete needs a FULL admin.
// ---------------------------------------------------------------------------

test('NEW-8: a restricted admin (assignments area only) cannot delete an assignment; a full admin can', async () => {
  seedAssignmentsBase();
  const assignment = await createAssignment({
    courseId: 'course-1', batchId: 'batch-8', title: 'To delete',
    description: 'Delete me.', dueDate: null, maxMarks: 10, createdBy: 'inst-1',
  });

  __setTestSession(RESTRICTED_ADMIN);
  const denied = await deleteAssignmentRoute(new NextRequest('http://localhost/api/admin/assignments/x', { method: 'DELETE' }), { params: Promise.resolve({ id: assignment.id }) });
  assert.equal(denied.status, 403);
  assert.match((await denied.json()).error, /Full admin/);

  __setTestSession(FULL_ADMIN);
  const ok = await deleteAssignmentRoute(new NextRequest('http://localhost/api/admin/assignments/x', { method: 'DELETE' }), { params: Promise.resolve({ id: assignment.id }) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).ok, true);
});

// ---------------------------------------------------------------------------
// NEW-9 — storage-key segments are allowlisted.
// ---------------------------------------------------------------------------

test('NEW-9: pageId ../../x is rejected at the route (400) and in the storage layer; a clean pageId uploads', async () => {
  assert.equal(isValidStorageKeySegment('../../x'), false);
  assert.equal(isValidStorageKeySegment('home'), true);
  assert.equal(isValidStorageKeySegment(''), false);
  assert.match(validateStorageKeySegment('../../x', 'Page id') ?? '', /not allowed/);
  assert.equal(validateStorageKeySegment('home', 'Page id'), null);

  const client = mockStorageClient();
  await assert.rejects(
    uploadPageImage('../../x', file('pic.png', 'image/png', PNG_BYTES), client),
    /not allowed/,
  );
  const ok = await uploadPageImage('home', file('pic.png', 'image/png', PNG_BYTES), client);
  assert.match(ok.path, /^pages\/home\/[0-9a-f-]+\.png$/);

  // Route-level: the traversal pageId is a 400 before storage is touched.
  __setTestSession(FULL_ADMIN);
  const form = new FormData();
  form.append('pageId', '../../x');
  form.append('image', new File([PNG_BYTES], 'pic.png', { type: 'image/png' }));
  const res = await pageBuilderUpload(new NextRequest('http://localhost/api/admin/page-builder/upload', { method: 'POST', body: form }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /not allowed/);
});

// ---------------------------------------------------------------------------
// NEW-12 — pure admins can read instructor assignment endpoints.
// ---------------------------------------------------------------------------

test('NEW-12: a pure admin lists ALL courses assignments; an instructor sees only their own', async () => {
  seedAssignmentsBase();
  await createAssignment({
    courseId: 'course-1', batchId: 'batch-8', title: 'A1',
    description: 'One.', dueDate: null, maxMarks: 10, createdBy: 'inst-1',
  });
  await createAssignment({
    courseId: 'course-2', batchId: 'batch-9', title: 'A2',
    description: 'Two.', dueDate: null, maxMarks: 10, createdBy: 'inst-2',
  });

  __setTestSession(FULL_ADMIN);
  const adminRes = await instructorAssignmentsList();
  assert.equal(adminRes.status, 200);
  const adminBody = (await adminRes.json()) as { assignments: { title: string }[]; courses: { id: string }[] };
  assert.deepEqual(adminBody.assignments.map((a) => a.title).sort(), ['A1', 'A2']);
  assert.deepEqual(adminBody.courses.map((c) => c.id).sort(), ['course-1', 'course-2']);

  __setTestSession(INST1);
  const instRes = await instructorAssignmentsList();
  assert.equal(instRes.status, 200);
  const instBody = (await instRes.json()) as { assignments: { title: string }[]; courses: { id: string }[] };
  assert.deepEqual(instBody.assignments.map((a) => a.title), ['A1']);
  assert.deepEqual(instBody.courses.map((c) => c.id), ['course-1']);
});

// ---------------------------------------------------------------------------
// NEW-14 — Colab validation pins the path, not just the host.
// ---------------------------------------------------------------------------

test('NEW-14: a bare colab.research.google.com URL is rejected; /drive/ and /github/ pass', () => {
  assert.equal(isValidColabUrl('https://colab.research.google.com/foo'), false);
  assert.equal(isValidColabUrl('https://colab.research.google.com/'), false);
  assert.equal(isValidColabUrl('https://colab.research.google.com'), false);
  assert.equal(isValidColabUrl('https://colab.research.google.com/drive/1AbC2dEf3GhI4jKl5MnOp'), true);
  assert.equal(isValidColabUrl('https://colab.research.google.com/github/user/repo/blob/main/notebook.ipynb'), true);
  assert.equal(isValidColabUrl('http://colab.research.google.com/drive/abc'), false);
  assert.equal(isValidColabUrl(COLAB), true);
});

test('NEW-14: updateSubmission enforces the Colab-link invariant at the repo layer', async () => {
  seedAssignmentsBase();
  const assignment = await createAssignment({
    courseId: 'course-1', batchId: 'batch-8', title: 'A1',
    description: 'One.', dueDate: null, maxMarks: 10, createdBy: 'inst-1',
  });
  const submission = await createSubmission({
    assignmentId: assignment.id, studentId: 'stu-1', colabUrl: COLAB, status: 'submitted',
  });
  await assert.rejects(
    updateSubmission(submission.id, { colabUrl: 'https://colab.research.google.com/foo' }),
    /Google Colab link/,
  );
  const ok = await updateSubmission(submission.id, { colabUrl: 'https://colab.research.google.com/drive/NEWID123' });
  assert.ok(ok);
  assert.equal(ok.colabUrl, 'https://colab.research.google.com/drive/NEWID123');
});
