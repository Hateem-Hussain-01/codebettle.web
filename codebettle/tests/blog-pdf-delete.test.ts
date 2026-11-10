import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  blogPdfStoragePath,
  deleteBlogPostService,
} from '../lib/services/blog-service';
import type { Actor } from '../lib/services/errors';
import { getBlogPostById } from '../lib/db/blog';

const D = (s: string) => new Date(s);
const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };
const PDF_URL =
  'https://phuzoxshzdfzjvephlhq.supabase.co/storage/v1/object/public/blog-pdfs/blogs/9f2c1a10-1111-2222-3333-444455556666.pdf';

let fake: FakeDb;

function mockStorageClient(overrides: {
  remove?: () => Promise<{ error: { message: string } | null }>;
} = {}): { client: SupabaseClient; removed: string[] } {
  const removed: string[] = [];
  const client = {
    storage: {
      from: (_bucket: string) => ({
        remove: async (paths: string[]) => {
          removed.push(...paths);
          if (overrides.remove) return overrides.remove();
          return { data: [], error: null };
        },
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, removed };
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('BlogPost', [
    {
      id: 'post-pdf', slug: 'with-pdf', title: 'With PDF', excerpt: 'E', content: 'C',
      pdfUrl: PDF_URL, thumbnail: '/t.png', category: 'General', authorId: 'admin-1',
      authorName: 'Admin', publishedAt: D('2024-05-01'), isPublished: true,
      readTime: '3 min read', tags: [], createdAt: D('2024-05-01'), updatedAt: D('2024-05-01'),
    },
    {
      id: 'post-plain', slug: 'no-pdf', title: 'No PDF', excerpt: 'E', content: 'C',
      pdfUrl: null, thumbnail: '/t.png', category: 'General', authorId: 'admin-1',
      authorName: 'Admin', publishedAt: D('2024-05-01'), isPublished: true,
      readTime: '3 min read', tags: [], createdAt: D('2024-05-01'), updatedAt: D('2024-05-01'),
    },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

test('blogPdfStoragePath derives blogs/<uuid>.pdf from a Supabase public URL', () => {
  assert.equal(
    blogPdfStoragePath(PDF_URL),
    'blogs/9f2c1a10-1111-2222-3333-444455556666.pdf',
  );
});

test('blogPdfStoragePath tolerates a query string or fragment after the path', () => {
  assert.equal(
    blogPdfStoragePath(`${PDF_URL}?token=abc#page=1`),
    'blogs/9f2c1a10-1111-2222-3333-444455556666.pdf',
  );
});

test('blogPdfStoragePath returns null when there is no pdfUrl', () => {
  assert.equal(blogPdfStoragePath(null), null);
  assert.equal(blogPdfStoragePath(undefined), null);
  assert.equal(blogPdfStoragePath(''), null);
});

test('blogPdfStoragePath returns null for URLs outside the blog-pdfs bucket', () => {
  assert.equal(blogPdfStoragePath('https://example.com/files/guide.pdf'), null);
  assert.equal(
    blogPdfStoragePath('https://example.supabase.co/storage/v1/object/public/other-bucket/blogs/x.pdf'),
    null,
  );
  // A bare storage path with no bucket marker is left alone.
  assert.equal(blogPdfStoragePath('blogs/abc.pdf'), null);
});

test('blogPdfStoragePath returns null when nothing follows the bucket marker', () => {
  assert.equal(
    blogPdfStoragePath('https://example.supabase.co/storage/v1/object/public/blog-pdfs/'),
    null,
  );
});

test('deleting a post with a stored PDF removes the file from storage first', async () => {
  const { client, removed } = mockStorageClient();
  const result = await deleteBlogPostService(ADMIN, 'post-pdf', client);
  assert.ok('success' in result, JSON.stringify(result));
  assert.deepEqual(removed, ['blogs/9f2c1a10-1111-2222-3333-444455556666.pdf']);
  assert.equal(await getBlogPostById('post-pdf'), null);
});

test('deleting a post without a PDF never touches storage', async () => {
  const { client, removed } = mockStorageClient();
  const result = await deleteBlogPostService(ADMIN, 'post-plain', client);
  assert.ok('success' in result, JSON.stringify(result));
  assert.deepEqual(removed, []);
  assert.equal(await getBlogPostById('post-plain'), null);
});

test('a storage failure does not block the post delete', async () => {
  const { client, removed } = mockStorageClient({
    remove: async () => ({ error: { message: 'Bucket not found' } }),
  });
  const result = await deleteBlogPostService(ADMIN, 'post-pdf', client);
  assert.ok('success' in result, JSON.stringify(result));
  assert.deepEqual(removed, ['blogs/9f2c1a10-1111-2222-3333-444455556666.pdf']);
  assert.equal(await getBlogPostById('post-pdf'), null);
});
