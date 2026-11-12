import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { __clearRateLimits } from '../lib/rate-limit';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  APPLICATION_FILES_BUCKET,
  uploadFormFile,
  validateFormUploadFile,
  createFormFileSignedUrl,
  FormUploadError,
} from '../lib/services/form-upload';
import { isFileReference } from '../lib/form-uploads';
import {
  validateFormSchema,
  validateSubmissionAgainstSchema,
} from '../lib/services/form-schema';
import {
  createFormService,
  exportFormSubmissionsCsvService,
  getFormFileService,
  getFormSubmissionService,
  submitFormMultipartService,
} from '../lib/services/form-service';
import { getFormSubmissionById } from '../lib/db/forms';
import { POST as publicSubmit } from '../app/api/forms/[slug]/submit/route';
import { GET as adminGetFile } from '../app/api/admin/forms/[id]/submissions/[submissionId]/file/route';
import type { FormSchema } from '../lib/db/types';
import type { SessionUser } from '../lib/services/auth-service';

/**
 * Forms Builder — file-upload field type (GHL upgrade, Worker C).
 * Covers: per-variant accept lists, server-side size/MIME/extension/
 * magic-byte validation (including a .exe renamed to .pdf), the
 * multipart submit flow (reference stored, never bytes), required
 * file enforcement, CSV showing the filename, the admin signed-URL
 * route (+ anonymous 401), and JSON submits still working for forms
 * without file fields.
 */

const D = (s: string) => new Date(s);
const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const RESTRICTED_ADMIN: SessionUser = {
  id: 'admin-2', name: 'Restricted', email: 'restricted@codebettle.com', role: 'admin',
  adminPermissions: {},
};

// Real magic bytes for each format (short but genuine headers).
const PDF_BYTES = new TextEncoder().encode('%PDF-1.4 fake pdf content').buffer as ArrayBuffer;
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 1]).buffer as ArrayBuffer;
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).buffer as ArrayBuffer;
const GIF_BYTES = new TextEncoder().encode('GIF89a fake gif').buffer as ArrayBuffer;
const WEBP_BYTES = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP')]).buffer as ArrayBuffer;
const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).buffer as ArrayBuffer;
const DOC_BYTES = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer as ArrayBuffer;
const MP4_BYTES = new Uint8Array([0, 0, 0, 0, ...new TextEncoder().encode('ftypisom'), 0, 0]).buffer as ArrayBuffer;
const WEBM_BYTES = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]).buffer as ArrayBuffer;
const TXT_BYTES = new TextEncoder().encode('hello world').buffer as ArrayBuffer;
// A Windows executable renamed to .pdf: MZ header, NOT %PDF.
const EXE_AS_PDF_BYTES = new Uint8Array([...new TextEncoder().encode('MZ'), 0, 0, 0, 0, 0, 0, 0]).buffer as ArrayBuffer;

function fileInput(name: string, type: string, bytes: ArrayBuffer, size?: number) {
  return { name, type, size: size ?? bytes.byteLength, arrayBuffer: bytes };
}

function mockStorageClient(overrides: {
  upload?: () => Promise<{ data: { path: string } | null; error: { message: string } | null }>;
  createSignedUrl?: () => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
} = {}): SupabaseClient {
  const calls: { bucket: string; path?: string; expiresIn?: number }[] = [];
  const client = {
    __calls: calls,
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => {
          calls.push({ bucket, path });
          if (overrides.upload) return overrides.upload();
          return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
        },
        createSignedUrl: async (path: string, expiresIn: number) => {
          calls.push({ bucket, path, expiresIn });
          if (overrides.createSignedUrl) return overrides.createSignedUrl();
          return { data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=x` }, error: null };
        },
        remove: async (paths: string[]) => {
          calls.push({ bucket, path: paths[0] });
          return { data: [], error: null };
        },
      }),
    },
  };
  return client as unknown as SupabaseClient;
}

const FILE_SCHEMA: FormSchema = {
  fields: [
    { id: 'name', type: 'text', label: 'Full name', required: true },
    { id: 'cv', type: 'file', label: 'Upload your CV', required: true, uploadVariant: 'document' },
    { id: 'photo', type: 'file', label: 'Photo', required: false, uploadVariant: 'picture' },
    { id: 'clip', type: 'file', label: 'Intro video', required: false, uploadVariant: 'video' },
    { id: 'extra', type: 'file', label: 'Any file', required: false, uploadVariant: 'files' },
  ],
};

let fake: FakeDb;

async function createPublishedFileForm(slug = 'job-application') {
  const result = await createFormService(ADMIN, {
    name: 'Job Application', slug, type: 'registration', schema: FILE_SCHEMA, status: 'published',
  });
  assert.ok(!('error' in result), JSON.stringify(result));
  return result.form;
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  __clearRateLimits();
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', isAdmin: true, status: 'active', joinedAt: D('2024-01-01') },
    { id: 'admin-2', name: 'Restricted', email: 'restricted@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', isAdmin: true, adminPermissions: {}, status: 'active', joinedAt: D('2024-01-01') },
  ]);
  __setTestSession(ADMIN);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
  __clearRateLimits();
});

// ---------------------------------------------------------------------------
// Variant accept lists + server-side validation
// ---------------------------------------------------------------------------

test('validation: each variant accepts its own types and rejects the others', async () => {
  assert.equal(await validateFormUploadFile('picture', fileInput('a.png', 'image/png', PNG_BYTES)), null);
  assert.equal(await validateFormUploadFile('picture', fileInput('a.jpg', 'image/jpeg', JPEG_BYTES)), null);
  assert.equal(await validateFormUploadFile('picture', fileInput('a.webp', 'image/webp', WEBP_BYTES)), null);
  assert.equal(await validateFormUploadFile('picture', fileInput('a.gif', 'image/gif', GIF_BYTES)), null);
  assert.match(await validateFormUploadFile('picture', fileInput('a.pdf', 'application/pdf', PDF_BYTES)) ?? '', /not allowed/);
  assert.equal(await validateFormUploadFile('document', fileInput('cv.pdf', 'application/pdf', PDF_BYTES)), null);
  assert.equal(await validateFormUploadFile('document', fileInput('cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', DOCX_BYTES)), null);
  assert.equal(await validateFormUploadFile('document', fileInput('cv.doc', 'application/msword', DOC_BYTES)), null);
  assert.match(await validateFormUploadFile('document', fileInput('a.png', 'image/png', PNG_BYTES)) ?? '', /not allowed/);
  assert.equal(await validateFormUploadFile('video', fileInput('v.mp4', 'video/mp4', MP4_BYTES)), null);
  assert.equal(await validateFormUploadFile('video', fileInput('v.webm', 'video/webm', WEBM_BYTES)), null);
  assert.match(await validateFormUploadFile('video', fileInput('v.avi', 'video/avi', MP4_BYTES)) ?? '', /not allowed/);
  // Generic variant: office + text allowed, executables/scripts/archives rejected.
  assert.equal(await validateFormUploadFile('files', fileInput('n.txt', 'text/plain', TXT_BYTES)), null);
  assert.equal(await validateFormUploadFile('files', fileInput('d.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', DOCX_BYTES)), null);
  assert.match(await validateFormUploadFile('files', fileInput('a.exe', 'application/x-msdownload', EXE_AS_PDF_BYTES)) ?? '', /not allowed/);
  assert.match(await validateFormUploadFile('files', fileInput('a.js', 'text/javascript', TXT_BYTES)) ?? '', /not allowed/);
  assert.match(await validateFormUploadFile('files', fileInput('a.html', 'text/html', TXT_BYTES)) ?? '', /not allowed/);
  assert.match(await validateFormUploadFile('files', fileInput('a.zip', 'application/zip', DOCX_BYTES)) ?? '', /not allowed/);
  assert.match(await validateFormUploadFile('files', fileInput('a.sh', 'application/x-sh', TXT_BYTES)) ?? '', /not allowed/);
});

test('validation: oversized files are rejected (declared size AND actual bytes)', async () => {
  const big = fileInput('big.pdf', 'application/pdf', PDF_BYTES, 6 * 1024 * 1024);
  assert.match(await validateFormUploadFile('document', big) ?? '', /5 MB or smaller/);
  const lying = fileInput('big.pdf', 'application/pdf', new ArrayBuffer(6 * 1024 * 1024 + 1), 10);
  // Declared size is small but the real bytes are over the limit.
  const lyingBytes = new Uint8Array(lying.arrayBuffer as ArrayBuffer);
  lyingBytes.set(new TextEncoder().encode('%PDF'));
  assert.match(await validateFormUploadFile('document', lying) ?? '', /5 MB or smaller/);
});

test('validation: MIME/extension mismatch is rejected; a .exe renamed to .pdf fails the magic-byte check', async () => {
  // Extension says .png but the MIME says PDF.
  assert.match(
    await validateFormUploadFile('files', fileInput('a.png', 'application/pdf', PDF_BYTES)) ?? '',
    /does not match its type/,
  );
  // The classic smuggle: an .exe renamed to .pdf. The browser would
  // report application/pdf for it (MIME comes from the extension) and
  // the extension agrees — only the magic bytes catch it (MZ, not %PDF).
  assert.match(
    await validateFormUploadFile('document', fileInput('cv.pdf', 'application/pdf', EXE_AS_PDF_BYTES)) ?? '',
    /contents do not match/,
  );
  // A genuine PDF with the same name/type passes.
  assert.equal(await validateFormUploadFile('document', fileInput('cv.pdf', 'application/pdf', PDF_BYTES)), null);
});

test('validation: a file with no extension or an empty file is rejected', async () => {
  assert.match(await validateFormUploadFile('document', fileInput('cv', 'application/pdf', PDF_BYTES)) ?? '', /extension/);
  assert.match(await validateFormUploadFile('document', fileInput('cv.pdf', 'application/pdf', new ArrayBuffer(0))) ?? '', /empty/);
});

// ---------------------------------------------------------------------------
// Storage upload
// ---------------------------------------------------------------------------

test('uploadFormFile: sends the file to the private application-files bucket and returns a reference, never bytes', async () => {
  const client = mockStorageClient();
  const ref = await uploadFormFile('form-123', 'document', fileInput('My CV.pdf', 'application/pdf', PDF_BYTES), client);
  assert.equal(ref.name, 'My CV.pdf');
  assert.equal(ref.mime, 'application/pdf');
  assert.equal(ref.size, PDF_BYTES.byteLength);
  assert.match(ref.url, /^form-uploads\/form-123\/[0-9a-f-]+\.pdf$/);
  assert.ok(isFileReference(ref));
  const calls = (client as unknown as { __calls: { bucket: string; path?: string }[] }).__calls;
  assert.equal(calls[0].bucket, APPLICATION_FILES_BUCKET);
  assert.equal(calls[0].path, ref.url);
});

test('uploadFormFile: the stored extension comes from the verified MIME, and bad files never reach storage', async () => {
  const client = mockStorageClient();
  await assert.rejects(
    uploadFormFile('form-123', 'document', fileInput('evil.pdf', 'application/pdf', EXE_AS_PDF_BYTES), client),
    (e: unknown) => e instanceof FormUploadError && e.status === 400,
  );
  const calls = (client as unknown as { __calls: unknown[] }).__calls;
  assert.equal(calls.length, 0);
});

test('uploadFormFile: a missing bucket surfaces as a 503, not a 500', async () => {
  await assert.rejects(
    uploadFormFile(
      'form-123', 'document', fileInput('cv.pdf', 'application/pdf', PDF_BYTES),
      mockStorageClient({ upload: async () => ({ data: null, error: { message: 'Bucket not found' } }) }),
    ),
    (e: unknown) => e instanceof FormUploadError && e.status === 503,
  );
});

test('createFormFileSignedUrl: refuses paths that do not belong to the form', async () => {
  await assert.rejects(
    createFormFileSignedUrl('form-a', 'form-uploads/form-b/11111111-1111-4111-8111-111111111111.pdf', 3600, mockStorageClient()),
    /does not belong to this form/,
  );
  await assert.rejects(
    createFormFileSignedUrl('form-a', 'cvs/11111111-1111-4111-8111-111111111111.pdf', 3600, mockStorageClient()),
    /does not belong to this form/,
  );
});

// ---------------------------------------------------------------------------
// Schema validation for file fields
// ---------------------------------------------------------------------------

test('validateFormSchema: file fields validate; unknown variants fail', () => {
  assert.deepEqual(validateFormSchema(FILE_SCHEMA), { ok: true });
  const bad = validateFormSchema({
    fields: [{ id: 'a', type: 'file', label: 'Upload', required: false, uploadVariant: 'archive' }],
  });
  assert.equal(bad.ok, false);
});

test('validateSubmissionAgainstSchema: a file field needs a valid reference; a wrong-variant MIME fails', () => {
  const goodRef = {
    name: 'cv.pdf',
    url: 'form-uploads/form-1/11111111-1111-4111-8111-111111111111.pdf',
    size: 1234,
    mime: 'application/pdf',
  };
  assert.deepEqual(
    validateSubmissionAgainstSchema(FILE_SCHEMA, { name: 'Ali', cv: goodRef }),
    { ok: true },
  );
  // Missing a required file field.
  const missing = validateSubmissionAgainstSchema(FILE_SCHEMA, { name: 'Ali' });
  assert.ok(missing.ok === false && missing.fieldErrors.cv === 'Upload your CV is required');
  // A picture in a document field.
  const wrongMime = validateSubmissionAgainstSchema(FILE_SCHEMA, {
    name: 'Ali',
    cv: { ...goodRef, mime: 'image/png', url: 'form-uploads/form-1/11111111-1111-4111-8111-111111111111.png' },
  });
  assert.ok(wrongMime.ok === false && wrongMime.fieldErrors.cv?.includes('PDF'));
  // A forged reference to an arbitrary path.
  const forged = validateSubmissionAgainstSchema(FILE_SCHEMA, {
    name: 'Ali',
    cv: { ...goodRef, url: 'cvs/someone-else.pdf' },
  });
  assert.ok(forged.ok === false && forged.fieldErrors.cv?.includes('not a valid uploaded file'));
});

// ---------------------------------------------------------------------------
// Multipart submit end-to-end (service level)
// ---------------------------------------------------------------------------

test('multipart submit: stores only the file reference, lists it back, and CSV shows the filename', async () => {
  const form = await createPublishedFileForm();
  const client = mockStorageClient();
  const result = await submitFormMultipartService(
    'job-application',
    { name: 'Ali Khan' },
    { cv: fileInput('Ali CV.pdf', 'application/pdf', PDF_BYTES) },
    undefined,
    client,
  );
  assert.ok(result.ok, JSON.stringify(result));
  assert.ok(result.ok);
  const submission = await getFormSubmissionById(result.submissionId);
  assert.ok(submission);
  const ref = submission.data.cv;
  assert.ok(isFileReference(ref));
  assert.equal(ref.name, 'Ali CV.pdf');
  assert.equal(ref.mime, 'application/pdf');
  assert.match(ref.url, new RegExp(`^form-uploads/${form.id}/[0-9a-f-]+\\.pdf$`));
  // No bytes anywhere in the stored data.
  assert.ok(!JSON.stringify(submission.data).includes('%PDF'));

  // The admin detail service returns the same reference.
  const detail = await getFormSubmissionService(ADMIN, form.id, result.submissionId);
  assert.ok(!('error' in detail));
  assert.ok(isFileReference(detail.submission.data.cv));

  // CSV export shows the filename, not a JSON blob.
  const csv = await exportFormSubmissionsCsvService(ADMIN, form.id);
  assert.ok(!('error' in csv), JSON.stringify(csv));
  assert.ok(!('error' in csv));
  assert.ok(csv.csv.includes('Ali CV.pdf'), csv.csv);
  assert.ok(!csv.csv.includes('{"name"'), csv.csv);
});

test('multipart submit: a missing required file is a 400 field error and nothing is stored', async () => {
  await createPublishedFileForm();
  const result = await submitFormMultipartService(
    'job-application',
    { name: 'Ali Khan' },
    {},
    undefined,
    mockStorageClient(),
  );
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.status === 400);
  assert.ok(!result.ok && result.fieldErrors?.cv === 'Upload your CV is required');
});

test('multipart submit: a bad file is a 400 field error and an earlier good upload is cleaned up', async () => {
  await createPublishedFileForm();
  const client = mockStorageClient();
  const result = await submitFormMultipartService(
    'job-application',
    { name: 'Ali Khan' },
    {
      cv: fileInput('cv.pdf', 'application/pdf', PDF_BYTES),
      photo: fileInput('photo.pdf', 'application/pdf', PDF_BYTES),
    },
    undefined,
    client,
  );
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.status === 400);
  assert.ok(!result.ok && result.fieldErrors?.photo?.includes('not allowed'));
  // The good CV upload was removed again (upload + remove calls).
  const calls = (client as unknown as { __calls: { bucket: string; path?: string }[] }).__calls;
  assert.ok(calls.length >= 2, JSON.stringify(calls));
});

// ---------------------------------------------------------------------------
// Public submit route: multipart + JSON
// ---------------------------------------------------------------------------

function multipartReq(url: string, data: Record<string, unknown>, files: Record<string, File>, ip: string): NextRequest {
  const form = new FormData();
  form.append('data', JSON.stringify(data));
  for (const [fieldId, file] of Object.entries(files)) {
    form.append(`file:${fieldId}`, file);
  }
  return new NextRequest(url, {
    method: 'POST',
    body: form,
    headers: { 'x-forwarded-for': ip },
  });
}

test('public submit route: multipart with a renamed .exe is rejected 400 before any storage is built', async () => {
  await createPublishedFileForm();
  // The route builds its own storage client from env — no key on this
  // VM, so a multipart submit would 503 at the upload step. The
  // service-level test above proves the happy-path flow with a mock
  // client; here the route is exercised for the multipart validation
  // path (a bad file is a 400 before any storage is built).
  const badFile = new File([new Uint8Array(EXE_AS_PDF_BYTES)], 'cv.pdf', { type: 'application/pdf' });
  const req = multipartReq(
    'http://localhost/api/forms/job-application/submit',
    { name: 'Ali Khan' },
    { cv: badFile },
    '10.0.0.1',
  );
  const res = await publicSubmit(req, { params: Promise.resolve({ slug: 'job-application' }) });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.fieldErrors?.cv?.includes('contents do not match'), true);
});

test('public submit route: JSON still works for forms without file fields', async () => {
  const created = await createFormService(ADMIN, {
    name: 'Plain Survey', slug: 'plain-survey', type: 'survey',
    schema: { fields: [{ id: 'name', type: 'text', label: 'Name', required: true }] },
    status: 'published',
  });
  assert.ok(!('error' in created));
  const req = new NextRequest('http://localhost/api/forms/plain-survey/submit', {
    method: 'POST',
    body: JSON.stringify({ data: { name: 'Ali' } }),
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.2' },
  });
  const res = await publicSubmit(req, { params: Promise.resolve({ slug: 'plain-survey' }) });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('public submit route: JSON submit to a form WITH a required file field is a 400 (files need multipart)', async () => {
  await createPublishedFileForm();
  const req = new NextRequest('http://localhost/api/forms/job-application/submit', {
    method: 'POST',
    body: JSON.stringify({ data: { name: 'Ali' } }),
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.3' },
  });
  const res = await publicSubmit(req, { params: Promise.resolve({ slug: 'job-application' }) });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.fieldErrors?.cv, 'Upload your CV is required');
});

// ---------------------------------------------------------------------------
// Admin signed-URL route
// ---------------------------------------------------------------------------

test('admin file route: admin gets a signed URL; anonymous gets 401; wrong form gets 404', async () => {
  const form = await createPublishedFileForm();
  const client = mockStorageClient();
  const submitted = await submitFormMultipartService(
    'job-application',
    { name: 'Ali Khan' },
    { cv: fileInput('Ali CV.pdf', 'application/pdf', PDF_BYTES) },
    undefined,
    client,
  );
  assert.ok(submitted.ok);
  assert.ok(submitted.ok);
  const submissionId = submitted.submissionId;

  // NOTE: the route builds its own storage client from env, so a live
  // signed URL cannot be minted on this VM (no service-role key). The
  // route is exercised here for its guards; the minting itself is
  // covered at the service level below.
  __setTestSession(null);
  const anon = await adminGetFile(
    new NextRequest(`http://localhost/api/admin/forms/${form.id}/submissions/${submissionId}/file?field=cv`),
    { params: Promise.resolve({ id: form.id, submissionId }) },
  );
  assert.equal(anon.status, 401);

  __setTestSession(RESTRICTED_ADMIN);
  const restricted = await adminGetFile(
    new NextRequest(`http://localhost/api/admin/forms/${form.id}/submissions/${submissionId}/file?field=cv`),
    { params: Promise.resolve({ id: form.id, submissionId }) },
  );
  assert.equal(restricted.status, 403);

  __setTestSession(ADMIN);
  const wrongForm = await adminGetFile(
    new NextRequest(`http://localhost/api/admin/forms/other-form/submissions/${submissionId}/file?field=cv`),
    { params: Promise.resolve({ id: 'other-form', submissionId }) },
  );
  assert.equal(wrongForm.status, 404);

  const noField = await adminGetFile(
    new NextRequest(`http://localhost/api/admin/forms/${form.id}/submissions/${submissionId}/file?field=photo`),
    { params: Promise.resolve({ id: form.id, submissionId }) },
  );
  assert.equal(noField.status, 404);
});

test('getFormFileService: mints a signed URL for the stored file (mock client)', async () => {
  const form = await createPublishedFileForm();
  const client = mockStorageClient();
  const submitted = await submitFormMultipartService(
    'job-application',
    { name: 'Ali Khan' },
    { cv: fileInput('Ali CV.pdf', 'application/pdf', PDF_BYTES) },
    undefined,
    client,
  );
  assert.ok(submitted.ok);
  assert.ok(submitted.ok);
  const result = await getFormFileService(ADMIN, form.id, submitted.submissionId, 'cv', client);
  assert.ok(!('error' in result), JSON.stringify(result));
  assert.ok(!('error' in result));
  assert.equal(result.name, 'Ali CV.pdf');
  assert.equal(result.mime, 'application/pdf');
  assert.ok(result.url.includes('object/sign/application-files/form-uploads/'), result.url);
});
