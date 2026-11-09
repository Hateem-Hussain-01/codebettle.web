import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BLOG_PDF_BUCKET,
  deleteBlogPdf,
  getBlogStorageClient,
  uploadBlogPdf,
} from '../lib/services/blog-storage';

const PDF_BYTES = new TextEncoder().encode('%PDF-1.4 fake pdf').buffer as ArrayBuffer;

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

test('upload sends the PDF to the blog-pdfs bucket and returns url + path', async () => {
  const client = mockClient();
  const result = await uploadBlogPdf(
    { name: 'notes.pdf', type: 'application/pdf', size: PDF_BYTES.byteLength, arrayBuffer: PDF_BYTES },
    client,
  );
  assert.match(result.path, /^blogs\/[0-9a-f-]+\.pdf$/);
  assert.ok(result.url.includes(BLOG_PDF_BUCKET), result.url);
  assert.ok(result.url.endsWith(result.path), result.url);
  const calls = (client as unknown as { __calls: { bucket: string; path?: string }[] }).__calls;
  assert.equal(calls[0].bucket, 'blog-pdfs');
  assert.equal(calls[0].path, result.path);
});

test('upload accepts a lazy arrayBuffer function', async () => {
  const result = await uploadBlogPdf(
    { name: 'notes.pdf', type: 'application/pdf', size: PDF_BYTES.byteLength, arrayBuffer: async () => PDF_BYTES },
    mockClient(),
  );
  assert.match(result.path, /^blogs\//);
});

test('upload rejects non-PDF files and oversized files before touching storage', async () => {
  const client = mockClient();
  await assert.rejects(
    uploadBlogPdf({ name: 'a.txt', type: 'text/plain', size: 10, arrayBuffer: PDF_BYTES }, client),
    /Only PDF files are allowed/,
  );
  await assert.rejects(
    uploadBlogPdf(
      { name: 'big.pdf', type: 'application/pdf', size: 11 * 1024 * 1024, arrayBuffer: PDF_BYTES },
      client,
    ),
    /10 MB or smaller/,
  );
  const calls = (client as unknown as { __calls: unknown[] }).__calls;
  assert.equal(calls.length, 0);
});

test('a storage upload error is reported without leaking internals', async () => {
  await assert.rejects(
    uploadBlogPdf(
      { name: 'notes.pdf', type: 'application/pdf', size: PDF_BYTES.byteLength, arrayBuffer: PDF_BYTES },
      mockClient({ upload: async () => ({ data: null, error: { message: 'Bucket not found' } }) }),
    ),
    /Blog PDF upload failed: Bucket not found/,
  );
});

test('deleteBlogPdf removes the path; a storage error throws', async () => {
  const client = mockClient();
  await deleteBlogPdf('blogs/abc.pdf', client);
  const calls = (client as unknown as { __calls: { path?: string }[] }).__calls;
  assert.equal(calls[0].path, 'blogs/abc.pdf');

  await assert.rejects(
    deleteBlogPdf(
      'blogs/abc.pdf',
      mockClient({ remove: async () => ({ error: { message: 'Not found' } }) }),
    ),
    /Blog PDF delete failed: Not found/,
  );
});

test('getBlogStorageClient throws naming SUPABASE_SERVICE_ROLE_KEY when it is missing', () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevUrl2 = process.env.SUPABASE_URL;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(() => getBlogStorageClient(), /SUPABASE_SERVICE_ROLE_KEY/);
  } finally {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    if (prevUrl2 === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl2;
  }
});
