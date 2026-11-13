import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  validateSuccessStoryStep,
  validateSuccessStorySubmit,
  youtubeVideoId,
  type SuccessStorySubmitInput,
} from '../lib/success-story-validation';
import {
  areSuccessStoryTablesReady,
  listSuccessStorySubmissions,
} from '../lib/db/success-stories';
import {
  __resetSuccessStoryStorageClient,
  __setSuccessStoryStorageClient,
  createSuccessStoryEvidenceSignedUrl,
  createSuccessStorySignedUpload,
  getSuccessStoryPublicUrl,
} from '../lib/services/success-story-storage';
import {
  deleteSuccessStory,
  editSuccessStoryDetails,
  getAdminSuccessStory,
  getPublicSuccessStory,
  listPublicSuccessStories,
  reviewSuccessStory,
  submitSuccessStory,
  toPublicSuccessStory,
} from '../lib/services/success-story-service';

// ---------------------------------------------------------------------------
// Mock storage: the files the tests pretend were uploaded through signed
// URLs. `list(dir)` returns the files in that directory with metadata.
// ---------------------------------------------------------------------------
const STORED_FILES: Record<string, { name: string; size: number; mimetype: string }[]> = {
  profiles: [{ name: 'test-photo.jpg', size: 1200, mimetype: 'image/jpeg' }],
  evidence: [{ name: 'cert.pdf', size: 5000, mimetype: 'application/pdf' }],
  videos: [{ name: 'testimonial.mp4', size: 8000000, mimetype: 'video/mp4' }],
};

function mockStorageClient(): SupabaseClient {
  const client = {
    storage: {
      from: (bucket: string) => ({
        list: async (dir?: string) => ({
          data: (STORED_FILES[dir ?? ''] ?? []).map((f) => ({
            name: f.name,
            metadata: { size: f.size, mimetype: f.mimetype },
          })),
          error: null,
        }),
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` },
        }),
        createSignedUploadUrl: async (path: string) => ({
          data: { signedUrl: `https://example.supabase.co/storage/v1/object/upload/sign/${bucket}/${path}?token=test`, token: 'test', path },
          error: null,
        }),
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=test` },
          error: null,
        }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
  };
  return client as unknown as SupabaseClient;
}

function validPayload(overrides: Partial<SuccessStorySubmitInput> = {}): SuccessStorySubmitInput {
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
    idempotencyKey: 'test-key-1',
    ...overrides,
  };
}

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  __setSuccessStoryStorageClient(mockStorageClient());
});

test.afterEach(() => {
  __resetDbClient();
  __resetSuccessStoryStorageClient();
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test('validation: a complete payload passes', () => {
  assert.deepEqual(validateSuccessStorySubmit(validPayload()), []);
});

test('validation: missing required fields are reported', () => {
  const errors = validateSuccessStorySubmit(
    validPayload({ fullName: '', email: '', profilePicturePath: null, country: '', courseTitle: '', skillsLearned: '', experience: '', story: '' }),
  );
  for (const expected of [
    'Full name is required',
    'Email address is required',
    'Profile picture is required',
    'Country is required',
    'Course is required',
    'Skills learned is required',
    'Learning experience description is required',
    'Your success story is required',
  ]) {
    assert.ok(errors.includes(expected), `expected "${expected}" in ${JSON.stringify(errors)}`);
  }
});

test('validation: invalid email and invalid social URL are reported', () => {
  const errors = validateSuccessStorySubmit(validPayload({ email: 'not-an-email', githubUrl: 'notaurl' }));
  assert.ok(errors.includes('Email address is not valid'));
  assert.ok(errors.some((e) => e.includes('GitHub profile URL')));
});

test('validation: all three required consents are enforced', () => {
  const errors = validateSuccessStorySubmit(
    validPayload({ consentPublication: false, consentMedia: false, consentAccuracy: false }),
  );
  assert.ok(errors.includes('Publication permission is required'));
  assert.ok(errors.includes('Media usage permission is required'));
  assert.ok(errors.includes('Information accuracy confirmation is required'));
  // Contact consent is optional.
  assert.deepEqual(validateSuccessStorySubmit(validPayload({ consentContact: true })), []);
});

test('validation: achievements need a category and a title; evidence links must be URLs', () => {
  const errors = validateSuccessStorySubmit(
    validPayload({
      achievements: [
        { category: '', title: '', evidence: [{ kind: 'link', url: 'notaurl', label: 'x' }] },
        { category: 'job', title: 'Got a job', evidence: [{ kind: 'file', url: 'wrong/path.pdf', label: 'x' }] },
      ],
    }),
  );
  assert.ok(errors.some((e) => e.includes('Achievement 1') && e.includes('category')));
  assert.ok(errors.some((e) => e.includes('Achievement 1') && e.includes('title')));
  assert.ok(errors.some((e) => e.includes('Achievement 1') && e.includes('valid URL')));
  assert.ok(errors.some((e) => e.includes('Achievement 2') && e.includes('file reference')));
});

test('validation: per-step validation only returns that step’s errors', () => {
  const payload = validPayload({ fullName: '', consentPublication: false }) as unknown as Record<string, unknown>;
  const step1 = validateSuccessStoryStep(1, payload);
  assert.ok(step1.includes('Full name is required'));
  assert.ok(!step1.some((e) => e.includes('Publication')));
  const step7 = validateSuccessStoryStep(7, payload);
  assert.ok(step7.includes('Publication permission is required'));
  assert.ok(!step7.some((e) => e.includes('Full name')));
});

test('youtubeVideoId extracts ids from watch, shorts and youtu.be URLs', () => {
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://example.com/video'), null);
  assert.equal(youtubeVideoId('not a url'), null);
});

// ---------------------------------------------------------------------------
// Storage (signed uploads + public URLs, mocked client)
// ---------------------------------------------------------------------------

test('storage: signed upload mints a profiles/ path for a valid picture', async () => {
  const signed = await createSuccessStorySignedUpload('profile', 'image/png', 1000, mockStorageClient());
  assert.ok(signed.path.startsWith('profiles/'));
  assert.equal(signed.bucket, 'success-stories');
  assert.ok(signed.signedUrl.includes('success-stories'));
});

test('storage: signed upload rejects a wrong MIME and an oversize video before touching storage', async () => {
  await assert.rejects(
    createSuccessStorySignedUpload('profile', 'application/pdf', 1000, mockStorageClient()),
    /not supported|not allowed/i,
  );
  await assert.rejects(
    createSuccessStorySignedUpload('video', 'video/mp4', 101 * 1024 * 1024, mockStorageClient()),
    /100 MB or smaller/,
  );
});

test('storage: public URL points at the public success-stories bucket', () => {
  const url = getSuccessStoryPublicUrl('profiles/test-photo.jpg', mockStorageClient());
  assert.ok(url.includes('success-stories/profiles/test-photo.jpg'));
});

test('storage: admin evidence signed URL is minted for a private file', async () => {
  const url = await createSuccessStoryEvidenceSignedUrl('evidence/cert.pdf', 3600, mockStorageClient());
  assert.ok(url.includes('application-files/evidence/cert.pdf'));
});

// ---------------------------------------------------------------------------
// Service: submission flow
// ---------------------------------------------------------------------------

test('service: submit creates SS-YYYY-0001, pending, with achievements + evidence', async () => {
  const result = await submitSuccessStory(validPayload(), null);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.submission.submissionNumber, /^SS-\d{4}-0001$/);
  assert.equal(result.submission.status, 'pending');
  assert.equal(result.submission.featured, false);
  assert.equal(result.submission.email, 'ayesha@example.com');
  assert.equal(result.submission.achievements.length, 1);
  assert.equal(result.submission.achievements[0].category, 'job');
  assert.equal(result.submission.achievements[0].evidence.length, 2);
  assert.equal(result.duplicate, false);
  assert.equal(await areSuccessStoryTablesReady(), true);
});

test('service: same idempotency key returns the original instead of a duplicate', async () => {
  const first = await submitSuccessStory(validPayload(), null);
  assert.equal(first.ok, true);
  const second = await submitSuccessStory(validPayload(), null);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(second.duplicate, true);
  assert.equal(second.submission.id, first.submission.id);
  const { total } = await listSuccessStorySubmissions();
  assert.equal(total, 1);
});

test('service: same email + course within 24h is a 409, but a rejected story never blocks a fresh submission', async () => {
  const first = await submitSuccessStory(validPayload(), null);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const again = await submitSuccessStory(validPayload({ idempotencyKey: 'test-key-2' }), null);
  assert.equal(again.ok, false);
  if (again.ok) return;
  assert.equal(again.status, 409);
  assert.match(again.error, /already under review/);

  // Reject the first story, then the same student may submit again.
  await reviewSuccessStory(first.submission.id, { status: 'rejected', reviewedBy: 'admin-1' });
  const fresh = await submitSuccessStory(validPayload({ idempotencyKey: 'test-key-3' }), null);
  assert.equal(fresh.ok, true);
  if (!fresh.ok) return;
  assert.match(fresh.submission.submissionNumber, /^SS-\d{4}-0002$/);
});

test('service: submission with a missing profile picture file is rejected', async () => {
  const result = await submitSuccessStory(
    validPayload({ profilePicturePath: 'profiles/does-not-exist.jpg' }),
    null,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 400);
  assert.match(result.error, /could not be found/i);
});

test('service: validation failures are 400 before any storage check', async () => {
  const result = await submitSuccessStory(validPayload({ fullName: '' }), null);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 400);
  assert.match(result.error, /Full name is required/);
});

// ---------------------------------------------------------------------------
// Service: public view — approved only, publication-safe fields only
// ---------------------------------------------------------------------------

test('service: public list shows approved stories only, featured first, with no private fields', async () => {
  const pending = await submitSuccessStory(validPayload(), null);
  assert.equal(pending.ok, true);
  if (!pending.ok) return;
  const approved = await submitSuccessStory(
    validPayload({ email: 'bilal@example.com', fullName: 'Bilal Ahmed', idempotencyKey: 'test-key-4' }),
    null,
  );
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  await reviewSuccessStory(approved.submission.id, { status: 'approved', featured: true, reviewedBy: 'admin-1' });

  // A pending story is invisible publicly.
  assert.equal(await getPublicSuccessStory(pending.submission.id), null);

  const list = await listPublicSuccessStories();
  assert.equal(list.length, 1);
  const pub = list[0];
  assert.equal(pub.fullName, 'Bilal Ahmed');
  assert.equal(pub.featured, true);
  assert.deepEqual(pub.categories, ['job']);
  // No private fields leak.
  assert.ok(!('email' in pub), 'email must not leak publicly');
  assert.ok(!('adminNote' in pub), 'adminNote must not leak publicly');
  assert.ok(!('idempotencyKey' in pub), 'idempotencyKey must not leak publicly');
  assert.ok(!('reviewedBy' in pub), 'reviewedBy must not leak publicly');
  // Evidence FILES are private — only shared LINKS are public.
  assert.equal(pub.achievements[0].links.length, 1);
  assert.equal(pub.achievements[0].links[0].url, 'https://github.com/ayesha/project');
  assert.ok(!JSON.stringify(pub).includes('evidence/cert.pdf'), 'private evidence path must not leak');
  // The public picture URL is present (public bucket).
  assert.ok(pub.profilePictureUrl?.includes('success-stories/profiles/test-photo.jpg'));
});

test('service: toPublicSuccessStory derives categories from achievements in canonical order', () => {
  const pub = toPublicSuccessStory({
    id: 's1',
    submissionNumber: 'SS-2026-0001',
    fullName: 'Test',
    email: 'test@example.com',
    country: 'Pakistan',
    courseTitle: 'Python Crash Course',
    skillsLearned: 'Python',
    experience: 'Great',
    story: 'My story',
    consentPublication: true,
    consentMedia: true,
    consentAccuracy: true,
    consentContact: false,
    status: 'approved',
    featured: false,
    enabled: true,
    displayOrder: 0,
    adminCreated: false,
    submittedAt: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T00:00:00.000Z',
    achievements: [
      { id: 'a1', submissionId: 's1', category: 'hackathon', title: 'Won', createdAt: '2026-11-13T00:00:00.000Z', evidence: [] },
      { id: 'a2', submissionId: 's1', category: 'job', title: 'Hired', createdAt: '2026-11-13T00:00:00.000Z', evidence: [] },
      { id: 'a3', submissionId: 's1', category: 'job', title: 'Promoted', createdAt: '2026-11-13T00:00:00.000Z', evidence: [] },
    ],
  });
  // Canonical order (job before hackathon), deduped.
  assert.deepEqual(pub.categories, ['job', 'hackathon']);
});

// ---------------------------------------------------------------------------
// Service: admin review, edit, delete
// ---------------------------------------------------------------------------

test('service: review approves + features a story and stamps reviewedAt', async () => {
  const created = await submitSuccessStory(validPayload(), null);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const reviewed = await reviewSuccessStory(created.submission.id, {
    status: 'approved',
    featured: true,
    adminNote: 'Verified the offer letter.',
    reviewedBy: 'admin-1',
  });
  assert.ok(reviewed);
  assert.equal(reviewed?.status, 'approved');
  assert.equal(reviewed?.featured, true);
  assert.equal(reviewed?.adminNote, 'Verified the offer letter.');
  assert.ok(reviewed?.reviewedAt);
  const pub = await getPublicSuccessStory(created.submission.id);
  assert.ok(pub);
});

test('service: edit changes story details before publication', async () => {
  const created = await submitSuccessStory(validPayload(), null);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const edited = await editSuccessStoryDetails(created.submission.id, {
    story: 'Edited story text.',
    batchNumber: 9,
  });
  assert.ok(edited);
  assert.equal(edited?.story, 'Edited story text.');
  assert.equal(edited?.batchNumber, 9);
  // Identity fields are untouched by the edit.
  assert.equal(edited?.fullName, 'Ayesha Khan');
  assert.equal(edited?.email, 'ayesha@example.com');
});

test('service: delete removes the submission; a second delete is a no-op', async () => {
  const created = await submitSuccessStory(validPayload(), null);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(await deleteSuccessStory(created.submission.id), true);
  assert.equal(await getAdminSuccessStory(created.submission.id), null);
  assert.equal(await deleteSuccessStory(created.submission.id), false);
});

// ---------------------------------------------------------------------------
// Public page: CEO message + vision render ONLY through the sanitizer
// ---------------------------------------------------------------------------

test('public page: settings HTML is rendered only via sanitizeEmailHtml, never raw', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const pagePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'success-stories', 'page.tsx');
  const src = readFileSync(pagePath, 'utf8');
  // The page imports the sanitizer and both rich-text values pass
  // through it before reaching dangerouslySetInnerHTML.
  assert.ok(src.includes("import { sanitizeEmailHtml } from '@/lib/sanitize'"));
  assert.ok(src.includes('sanitizeEmailHtml('));
  assert.ok(src.includes('dangerouslySetInnerHTML={{ __html: ceoMessageHtml }}'));
  assert.ok(src.includes('dangerouslySetInnerHTML={{ __html: visionTextHtml }}'));
  // No raw setting value reaches the DOM: the only dangerouslySetInnerHTML
  // uses are the two sanitized variables above.
  const rawUses = src.match(/dangerouslySetInnerHTML=\{\{ __html: (?!ceoMessageHtml|visionTextHtml)[^}]+ \}\}/g);
  assert.equal(rawUses, null);
  // The page reads the texts from settings (not hardcoded), with the
  // in-code placeholder as the fallback when a setting is empty.
  assert.ok(src.includes('getSiteSettings()'));
  assert.ok(src.includes('CEO_MESSAGE_PLACEHOLDER'));
  assert.ok(src.includes('VISION_TEXT_PLACEHOLDER'));
  // The CEO photo comes from settings too (settings.ceoPhotoUrl); the
  // default URL lives in DEFAULT_SETTINGS, not in the page.
  assert.ok(src.includes('settings.ceoPhotoUrl'));
  assert.ok(!src.includes('ahmad-hassan-ceo.png'));
  const { DEFAULT_SETTINGS } = await import('../lib/services/settings-service');
  assert.ok(DEFAULT_SETTINGS.ceoPhotoUrl.includes('course-images/team/ahmad-hassan-ceo.png'));
});
