import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  APPLICATION_FILES_BUCKET,
  createApplicationFileSignedUrl,
  deleteApplicationFile,
  getApplicationStorageClient,
  uploadApplicationFile,
} from '../lib/services/application-storage';

const PDF_BYTES = new TextEncoder().encode('%PDF-1.4 fake pdf').buffer as ArrayBuffer;
const MP4_BYTES = new TextEncoder().encode('fake mp4').buffer as ArrayBuffer;

function mockClient(overrides: {
  upload?: () => Promise<{ data: { path: string } | null; error: { message: string } | null }>;
  remove?: () => Promise<{ error: { message: string } | null }>;
  createSignedUrl?: () => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
} = {}): SupabaseClient {
  const calls: { bucket: string; path?: string; body?: unknown; expiresIn?: number }[] = [];
  const client = {
    __calls: calls,
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: unknown) => {
          calls.push({ bucket, path, body });
          if (overrides.upload) return overrides.upload();
          return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
        },
        createSignedUrl: async (path: string, expiresIn: number) => {
          calls.push({ bucket, path, expiresIn });
          if (overrides.createSignedUrl) return overrides.createSignedUrl();
          return { data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=abc` }, error: null };
        },
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

test('CV upload sends the file to the private application-files bucket and returns the path', async () => {
  const client = mockClient();
  const result = await uploadApplicationFile(
    'cv',
    { name: 'cv.pdf', type: 'application/pdf', size: PDF_BYTES.byteLength, arrayBuffer: PDF_BYTES },
    client,
  );
  assert.match(result.path, /^cvs\/[0-9a-f-]+\.pdf$/);
  const calls = (client as unknown as { __calls: { bucket: string; path?: string }[] }).__calls;
  assert.equal(calls[0].bucket, APPLICATION_FILES_BUCKET);
  assert.equal(calls[0].path, result.path);
});

test('CV upload accepts DOC and DOCX with the right extension', async () => {
  const doc = await uploadApplicationFile(
    'cv',
    { name: 'cv.doc', type: 'application/msword', size: 10, arrayBuffer: PDF_BYTES },
    mockClient(),
  );
  assert.ok(doc.path.endsWith('.doc'), doc.path);
  const docx = await uploadApplicationFile(
    'cv',
    { name: 'cv.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 10, arrayBuffer: PDF_BYTES },
    mockClient(),
  );
  assert.ok(docx.path.endsWith('.docx'), docx.path);
});

test('demo upload sends the video to demos/ and returns the path', async () => {
  const client = mockClient();
  const result = await uploadApplicationFile(
    'demo',
    { name: 'lecture.mp4', type: 'video/mp4', size: MP4_BYTES.byteLength, arrayBuffer: MP4_BYTES },
    client,
  );
  assert.match(result.path, /^demos\/[0-9a-f-]+\.mp4$/);
  const calls = (client as unknown as { __calls: { bucket: string }[] }).__calls;
  assert.equal(calls[0].bucket, APPLICATION_FILES_BUCKET);
});

test('upload rejects wrong types and oversized files before touching storage', async () => {
  const client = mockClient();
  await assert.rejects(
    uploadApplicationFile('cv', { name: 'a.txt', type: 'text/plain', size: 10, arrayBuffer: PDF_BYTES }, client),
    /Only PDF, DOC or DOCX/,
  );
  await assert.rejects(
    uploadApplicationFile('cv', { name: 'big.pdf', type: 'application/pdf', size: 6 * 1024 * 1024, arrayBuffer: PDF_BYTES }, client),
    /5 MB or smaller/,
  );
  await assert.rejects(
    uploadApplicationFile('demo', { name: 'a.avi', type: 'video/avi', size: 10, arrayBuffer: MP4_BYTES }, client),
    /Only MP4, WebM or MOV/,
  );
  await assert.rejects(
    uploadApplicationFile('demo', { name: 'big.mp4', type: 'video/mp4', size: 101 * 1024 * 1024, arrayBuffer: MP4_BYTES }, client),
    /100 MB or smaller/,
  );
  const calls = (client as unknown as { __calls: unknown[] }).__calls;
  assert.equal(calls.length, 0);
});

test('a storage upload error is reported without leaking internals', async () => {
  await assert.rejects(
    uploadApplicationFile(
      'cv',
      { name: 'cv.pdf', type: 'application/pdf', size: PDF_BYTES.byteLength, arrayBuffer: PDF_BYTES },
      mockClient({ upload: async () => ({ data: null, error: { message: 'Bucket not found' } }) }),
    ),
    /Application file upload failed: Bucket not found/,
  );
});

test('signed URL mints a 1-hour link from the private bucket; a storage error throws', async () => {
  const client = mockClient();
  const url = await createApplicationFileSignedUrl('cvs/abc.pdf', 3600, client);
  assert.ok(url.includes(APPLICATION_FILES_BUCKET), url);
  assert.ok(url.includes('cvs/abc.pdf'), url);
  const calls = (client as unknown as { __calls: { expiresIn?: number }[] }).__calls;
  assert.equal(calls[0].expiresIn, 3600);

  await assert.rejects(
    createApplicationFileSignedUrl(
      'cvs/abc.pdf',
      3600,
      mockClient({ createSignedUrl: async () => ({ data: null, error: { message: 'Not found' } }) }),
    ),
    /Could not open the file: Not found/,
  );
});

test('deleteApplicationFile removes the path; a storage error throws', async () => {
  const client = mockClient();
  await deleteApplicationFile('cvs/abc.pdf', client);
  const calls = (client as unknown as { __calls: { path?: string }[] }).__calls;
  assert.equal(calls[0].path, 'cvs/abc.pdf');

  await assert.rejects(
    deleteApplicationFile(
      'cvs/abc.pdf',
      mockClient({ remove: async () => ({ error: { message: 'Not found' } }) }),
    ),
    /Application file delete failed: Not found/,
  );
});

test('getApplicationStorageClient throws naming SUPABASE_SERVICE_ROLE_KEY when it is missing', () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevUrl2 = process.env.SUPABASE_URL;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(() => getApplicationStorageClient(), /SUPABASE_SERVICE_ROLE_KEY/);
  } finally {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    if (prevUrl2 === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl2;
  }
});
