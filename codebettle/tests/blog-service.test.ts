import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { getBlogPostById } from '../lib/db/blog';
import {
  createBlogPostService,
  deleteBlogPostService,
  updateBlogPostService,
} from '../lib/services/blog-service';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);
const TODAY = new Date().toISOString().slice(0, 10);

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };
const INST1: Actor = { id: 'inst-1', role: 'instructor', name: 'Usman' };
const INST2: Actor = { id: 'inst-2', role: 'instructor', name: 'Sara' };
const STUDENT: Actor = { id: 'stu-1', role: 'student', name: 'Ali' };

let fake: FakeDb;

function basePost() {
  return {
    slug: 'hello-world',
    title: 'Hello World',
    excerpt: 'Intro',
    content: 'Body text',
    thumbnail: '/t.png',
    category: 'General',
    readTime: '5 min read',
    tags: ['intro'],
  };
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-2', name: 'Sara', email: 'sara@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
  fake.seed('BlogPost', [
    {
      id: 'post-1', slug: 'first-post', title: 'First', excerpt: 'E', content: 'C', pdfUrl: null,
      thumbnail: '/t.png', category: 'General', authorId: 'inst-1', authorName: 'Usman',
      publishedAt: D('2024-05-01'), isPublished: true, readTime: '3 min read', tags: [],
      createdAt: D('2024-05-01'), updatedAt: D('2024-05-01'),
    },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

test('admin and instructor create posts; publishing stamps today; student gets 403', async () => {
  const asAdmin = await createBlogPostService(ADMIN, { ...basePost(), slug: 'admin-post', isPublished: true });
  assert.ok('post' in asAdmin, JSON.stringify(asAdmin));
  assert.equal(asAdmin.post.authorId, 'admin-1');
  assert.equal(asAdmin.post.publishedAt, TODAY);

  const asInstructor = await createBlogPostService(INST1, { ...basePost(), slug: 'draft-post' });
  assert.ok('post' in asInstructor, JSON.stringify(asInstructor));
  assert.equal(asInstructor.post.isPublished, false);
  assert.equal(asInstructor.post.publishedAt, '');

  const asStudent = await createBlogPostService(STUDENT, { ...basePost(), slug: 'stu-post' });
  assert.ok('error' in asStudent && asStudent.status === 403, JSON.stringify(asStudent));
});

test('duplicate slug is rejected on create and on update', async () => {
  const dupe = await createBlogPostService(ADMIN, { ...basePost(), slug: 'first-post' });
  assert.ok('error' in dupe && dupe.status === 400, JSON.stringify(dupe));

  const created = await createBlogPostService(ADMIN, { ...basePost(), slug: 'second-post' });
  assert.ok('post' in created, JSON.stringify(created));
  const clash = await updateBlogPostService(ADMIN, created.post.id, { slug: 'first-post' });
  assert.ok('error' in clash && clash.status === 400, JSON.stringify(clash));

  // Keeping your own slug is fine.
  const same = await updateBlogPostService(ADMIN, created.post.id, { slug: 'second-post' });
  assert.ok('post' in same, JSON.stringify(same));
});

test('instructor edits only their own posts; admin edits any', async () => {
  const own = await updateBlogPostService(INST1, 'post-1', { title: 'First (edited)' });
  assert.ok('post' in own && own.post.title === 'First (edited)', JSON.stringify(own));

  const others = await updateBlogPostService(INST2, 'post-1', { title: 'Hijack' });
  assert.ok('error' in others && others.status === 403, JSON.stringify(others));

  const asAdmin = await updateBlogPostService(ADMIN, 'post-1', { title: 'Admin edit' });
  assert.ok('post' in asAdmin, JSON.stringify(asAdmin));

  const asStudent = await updateBlogPostService(STUDENT, 'post-1', { title: 'Hijack' });
  assert.ok('error' in asStudent && asStudent.status === 403, JSON.stringify(asStudent));

  const missing = await updateBlogPostService(ADMIN, 'ghost', { title: 'x' });
  assert.ok('error' in missing && missing.status === 404, JSON.stringify(missing));
});

test('publishing on update stamps publishedAt when the post never had one', async () => {
  const draft = await createBlogPostService(INST1, { ...basePost(), slug: 'to-publish' });
  assert.ok('post' in draft, JSON.stringify(draft));
  const published = await updateBlogPostService(INST1, draft.post.id, { isPublished: true });
  assert.ok('post' in published, JSON.stringify(published));
  assert.equal(published.post.isPublished, true);
  assert.equal(published.post.publishedAt, TODAY);
});

test('delete is a hard delete; only the author-instructor or an admin may delete', async () => {
  const byOther = await deleteBlogPostService(INST2, 'post-1');
  assert.ok('error' in byOther && byOther.status === 403, JSON.stringify(byOther));

  const byAuthor = await deleteBlogPostService(INST1, 'post-1');
  assert.ok('success' in byAuthor, JSON.stringify(byAuthor));
  assert.equal(await getBlogPostById('post-1'), null);

  const again = await deleteBlogPostService(ADMIN, 'post-1');
  assert.ok('error' in again && again.status === 404, JSON.stringify(again));
});
