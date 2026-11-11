/**
 * Module 3 (Phase 2) — teacher application form hardening.
 *
 * Covers: client validity (Submit disabled until valid), the zod
 * schema's new required fields + email format, the service's
 * server-side enforcement + duplicate rule, the orphan-cleanup
 * helper, and the DELETE cleanup route's path guard.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { applicationCreateSchema } from '../lib/api-schemas';
import { reviewApplicationService, submitApplication } from '../lib/services/application-service';
import {
  isApplicationFormValid,
  isValidApplicationEmail,
  isValidProfileUrl,
  type ApplicationFormValidityInput,
} from '../lib/application-form-validation';
import { cleanupUploadedApplicationFiles } from '../lib/application-file-cleanup';
import { isApplicationFilePath } from '../lib/services/application-storage';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };

/** A complete, valid application — the shape the hardened form submits. */
const VALID = {
  name: 'Nadia Teacher',
  email: 'nadia@example.com',
  phone: '+92 300 1234567',
  expertise: 'Python',
  experience: '5 years',
  message: 'I want to teach because I love helping students.',
  additionalInfo: 'Evenings work best.',
  whyGoodFit: 'I built the course this site teaches.',
  cvUrl: 'cvs/11111111-1111-1111-1111-111111111111.pdf',
  linkedinUrl: 'https://www.linkedin.com/in/nadia-teacher',
  githubUrl: 'https://github.com/nadiateacher',
  demoRecordingUrl: 'demos/22222222-2222-2222-2222-222222222222.mp4',
};

const VALID_FORM: ApplicationFormValidityInput = {
  name: 'Nadia Teacher',
  email: 'nadia@example.com',
  expertise: 'Python',
  experience: '5 years',
  message: 'I want to teach because I love helping students.',
  linkedinUrl: 'https://www.linkedin.com/in/nadia-teacher',
  githubUrl: 'https://github.com/nadiateacher',
  whyGoodFit: 'I built the course this site teaches.',
  hasCvFile: true,
  hasDemoFile: true,
  cvError: '',
  demoError: '',
};

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

// ---------------------------------------------------------------------------
// Client validity — Submit disabled until valid
// ---------------------------------------------------------------------------

test('client validity: a complete form is valid; each missing required field disables submit', () => {
  assert.equal(isApplicationFormValid(VALID_FORM), true);

  const missing: Array<[string, ApplicationFormValidityInput]> = [
    ['name', { ...VALID_FORM, name: '   ' }],
    ['email', { ...VALID_FORM, email: 'not-an-email' }],
    ['expertise', { ...VALID_FORM, expertise: '' }],
    ['experience', { ...VALID_FORM, experience: '' }],
    ['message', { ...VALID_FORM, message: '' }],
    ['linkedinUrl', { ...VALID_FORM, linkedinUrl: '' }],
    ['linkedin wrong host', { ...VALID_FORM, linkedinUrl: 'https://example.com/in/nadia' }],
    ['whyGoodFit', { ...VALID_FORM, whyGoodFit: '   ' }],
    ['cv file', { ...VALID_FORM, hasCvFile: false }],
    ['demo file', { ...VALID_FORM, hasDemoFile: false }],
  ];
  for (const [label, input] of missing) {
    assert.equal(isApplicationFormValid(input), false, `should be invalid without ${label}`);
  }
});

test('client validity: a file error disables submit; optional fields may be empty', () => {
  assert.equal(isApplicationFormValid({ ...VALID_FORM, cvError: 'CV must be 5 MB or smaller.' }), false);
  assert.equal(isApplicationFormValid({ ...VALID_FORM, demoError: 'Demo recording must be an MP4, WebM or MOV video.' }), false);
  // GitHub is optional; an empty one is fine, a wrong-host one is not.
  assert.equal(isApplicationFormValid({ ...VALID_FORM, githubUrl: '' }), true);
  assert.equal(isApplicationFormValid({ ...VALID_FORM, githubUrl: 'https://gitlab.com/nadia' }), false);
});

test('client validity helpers: email and profile URLs', () => {
  assert.equal(isValidApplicationEmail('a@b.com'), true);
  assert.equal(isValidApplicationEmail('a@b'), false);
  assert.equal(isValidApplicationEmail('  a@b.com  '), true);
  assert.equal(isValidProfileUrl('https://linkedin.com/in/x', 'linkedin.com'), true);
  assert.equal(isValidProfileUrl('https://www.linkedin.com/in/x', 'linkedin.com'), true);
  assert.equal(isValidProfileUrl('https://notlinkedin.com/in/x', 'linkedin.com'), false);
  assert.equal(isValidProfileUrl('not-a-url', 'linkedin.com'), false);
  assert.equal(isValidProfileUrl('', 'linkedin.com'), false);
});

// ---------------------------------------------------------------------------
// Zod schema — new required fields + email format
// ---------------------------------------------------------------------------

test('schema: a complete application parses; message/additionalInfo/phone stay optional', () => {
  const parsed = applicationCreateSchema.safeParse(VALID);
  assert.ok(parsed.success, JSON.stringify(parsed.error));
  assert.equal(parsed.data.message, VALID.message);
  assert.equal(parsed.data.additionalInfo, VALID.additionalInfo);
  assert.equal(parsed.data.phone, VALID.phone);

  const minimal = applicationCreateSchema.safeParse({
    name: 'Rahim',
    email: 'rahim@example.com',
    linkedinUrl: 'https://linkedin.com/in/rahim',
    cvUrl: 'cvs/11111111-1111-1111-1111-111111111111.pdf',
    demoRecordingUrl: 'demos/22222222-2222-2222-2222-222222222222.mp4',
    whyGoodFit: 'I love teaching.',
  });
  assert.ok(minimal.success, JSON.stringify(minimal.error));
  assert.equal(minimal.data.message, undefined);
  assert.equal(minimal.data.additionalInfo, undefined);
});

test('schema: rejects a missing LinkedIn/CV/demo/whyGoodFit and an invalid email', () => {
  const { linkedinUrl: _l, ...noLinkedin } = VALID;
  assert.equal(applicationCreateSchema.safeParse(noLinkedin).success, false);
  const { cvUrl: _c, ...noCv } = VALID;
  assert.equal(applicationCreateSchema.safeParse(noCv).success, false);
  const { demoRecordingUrl: _d, ...noDemo } = VALID;
  assert.equal(applicationCreateSchema.safeParse(noDemo).success, false);
  const { whyGoodFit: _w, ...noFit } = VALID;
  assert.equal(applicationCreateSchema.safeParse(noFit).success, false);
  assert.equal(applicationCreateSchema.safeParse({ ...VALID, email: 'not-an-email' }).success, false);
  assert.equal(applicationCreateSchema.safeParse({ ...VALID, email: '' }).success, false);
});

// ---------------------------------------------------------------------------
// Service — server-side enforcement + duplicate rule
// ---------------------------------------------------------------------------

test('service: rejects a missing LinkedIn/CV/demo/whyGoodFit and an invalid email', async () => {
  for (const [label, patch] of [
    ['linkedin', { linkedinUrl: undefined }],
    ['cv', { cvUrl: undefined }],
    ['demo', { demoRecordingUrl: undefined }],
    ['whyGoodFit', { whyGoodFit: undefined }],
    ['whyGoodFit blank', { whyGoodFit: '   ' }],
  ] as const) {
    const result = await submitApplication({ ...VALID, ...patch, email: `${label}@example.com` });
    assert.ok('error' in result && result.status === 400, `${label}: ${JSON.stringify(result)}`);
  }
  const badEmail = await submitApplication({ ...VALID, email: 'not-an-email' });
  assert.ok('error' in badEmail && badEmail.status === 400, JSON.stringify(badEmail));
});

test('service: a duplicate pending application for the same email is rejected with 409', async () => {
  const first = await submitApplication(VALID);
  assert.ok('application' in first, JSON.stringify(first));
  assert.equal(first.application.status, 'pending');

  const second = await submitApplication({ ...VALID, name: 'Nadia Again' });
  assert.ok('error' in second && second.status === 409, JSON.stringify(second));
  assert.match(second.error, /already have a pending/i);
});

test('service: the same email may apply again after rejection or approval', async () => {
  const first = await submitApplication(VALID);
  assert.ok('application' in first, JSON.stringify(first));
  const rejected = await reviewApplicationService(ADMIN, first.application.id, 'rejected');
  assert.ok('application' in rejected, JSON.stringify(rejected));

  const again = await submitApplication({ ...VALID, whyGoodFit: 'Still a good fit.' });
  assert.ok('application' in again, JSON.stringify(again));
  assert.equal(again.application.status, 'pending');

  const approved = await reviewApplicationService(ADMIN, again.application.id, 'approved');
  assert.ok('application' in approved, JSON.stringify(approved));

  const third = await submitApplication({ ...VALID, whyGoodFit: 'Third time.' });
  assert.ok('application' in third, JSON.stringify(third));
});

test('service: a complete application stores the new fields and phone', async () => {
  const created = await submitApplication(VALID);
  assert.ok('application' in created, JSON.stringify(created));
  assert.equal(created.application.additionalInfo, 'Evenings work best.');
  assert.equal(created.application.whyGoodFit, 'I built the course this site teaches.');
  assert.equal(created.application.phone, '+92 300 1234567');
  assert.equal(created.application.cvUrl, VALID.cvUrl);
  assert.equal(created.application.demoRecordingUrl, VALID.demoRecordingUrl);
});

// ---------------------------------------------------------------------------
// Orphan cleanup — helper + DELETE route path guard
// ---------------------------------------------------------------------------

test('cleanup helper: DELETEs each uploaded path; a failed delete never throws', async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { method?: string }) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    return { ok: true } as Response;
  }) as typeof fetch;
  try {
    await cleanupUploadedApplicationFiles([
      'cvs/11111111-1111-1111-1111-111111111111.pdf',
      'demos/22222222-2222-2222-2222-222222222222.mp4',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.method, 'DELETE');
  assert.equal(
    calls[0]?.url,
    '/api/applications/upload?path=cvs%2F11111111-1111-1111-1111-111111111111.pdf',
  );
  assert.equal(calls[1]?.method, 'DELETE');

  // A network failure while cleaning up must not throw (best-effort).
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  try {
    await cleanupUploadedApplicationFiles(['cvs/11111111-1111-1111-1111-111111111111.pdf']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cleanup path guard: only paths the upload route returns are deletable', () => {
  assert.equal(isApplicationFilePath('cvs/11111111-1111-1111-1111-111111111111.pdf'), true);
  assert.equal(isApplicationFilePath('cvs/11111111-1111-1111-1111-111111111111.docx'), true);
  assert.equal(isApplicationFilePath('demos/22222222-2222-2222-2222-222222222222.mp4'), true);
  assert.equal(isApplicationFilePath('demos/22222222-2222-2222-2222-222222222222.mov'), true);
  // Wrong extension for the folder, wrong folder, traversal, plain names.
  assert.equal(isApplicationFilePath('cvs/11111111-1111-1111-1111-111111111111.mp4'), false);
  assert.equal(isApplicationFilePath('demos/22222222-2222-2222-2222-222222222222.pdf'), false);
  assert.equal(isApplicationFilePath('avatars/11111111-1111-1111-1111-111111111111.pdf'), false);
  assert.equal(isApplicationFilePath('../cvs/11111111-1111-1111-1111-111111111111.pdf'), false);
  assert.equal(isApplicationFilePath('cvs/not-a-uuid.pdf'), false);
  assert.equal(isApplicationFilePath('cvs/11111111-1111-1111-1111-111111111111.pdf?x=1'), false);
});

test('DELETE cleanup route: rejects a missing or invalid path without touching storage', async () => {
  const route = await import('../app/api/applications/upload/route');
  const missing = await route.DELETE(new NextRequest('http://localhost/api/applications/upload'));
  assert.equal(missing.status, 400);
  const bad = await route.DELETE(
    new NextRequest('http://localhost/api/applications/upload?path=avatars%2Fevil.pdf'),
  );
  assert.equal(bad.status, 400);
});

test('DELETE cleanup route: returns 503 when storage is not configured', async () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevUrl2 = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const route = await import('../app/api/applications/upload/route');
    const res = await route.DELETE(
      new NextRequest(
        'http://localhost/api/applications/upload?path=cvs%2F11111111-1111-1111-1111-111111111111.pdf',
      ),
    );
    assert.equal(res.status, 503);
  } finally {
    if (prevUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevUrl2 !== undefined) process.env.SUPABASE_URL = prevUrl2;
    if (prevKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  }
});
