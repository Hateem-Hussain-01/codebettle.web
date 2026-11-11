import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { GET as getNotes, POST as createNoteRoute } from '../app/api/student/notes/route';
import { DELETE as deleteNoteRoute, PATCH as updateNoteRoute } from '../app/api/student/notes/[id]/route';
import { GET as getWishlist, POST as addWishlistRoute } from '../app/api/student/wishlist/route';
import { DELETE as deleteWishlistRoute } from '../app/api/student/wishlist/[id]/route';
import type { SessionUser } from '../lib/services/auth-service';

/**
 * Phase 0d — real Notes & Wishlist (Module 4).
 * Before this, both features were hardcoded frontend constants
 * (INITIAL_NOTES, INITIAL_WISHLIST = ['course-3', 'course-5']) with no
 * models, no APIs and no persistence — every student saw the same data.
 * Now: student-scoped routes backed by the Note/Wishlist tables, with
 * ownership enforced by session id (never a userId from the body).
 */

const D = (s: string) => new Date(s);
const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };
const STU2: SessionUser = { id: 'stu-2', name: 'Sara', email: 'sara@example.com', role: 'student' };
const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function course(id: string, slug: string) {
  return {
    id, slug, title: slug, description: 'Intro', longDescription: 'Long',
    thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
    instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
    isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
    tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
    createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
  };
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [course('course-1', 'web-101'), course('course-2', 'py-101')]);
  fake.seed('Note', [
    { id: 'note-1', userId: 'stu-1', title: 'Hooks', content: 'useState', courseId: 'course-1', createdAt: D('2024-05-01'), updatedAt: D('2024-05-01') },
    { id: 'note-2', userId: 'stu-2', title: 'NumPy', content: 'np.array', courseId: null, createdAt: D('2024-05-02'), updatedAt: D('2024-05-02') },
  ]);
  fake.seed('Wishlist', [
    { id: 'wish-1', userId: 'stu-2', courseId: 'course-1', createdAt: D('2024-05-01') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// --- Notes: scoping ---------------------------------------------------------

test('GET /api/student/notes: a student sees only their own notes, newest first', async () => {
  __setTestSession(STU1);
  const res = await getNotes();
  assert.equal(res.status, 200);
  const body = (await res.json()) as { notes: { id: string; title: string; courseTitle?: string }[] };
  assert.deepEqual(body.notes.map((n) => n.id), ['note-1']);
  assert.equal(body.notes[0].courseTitle, 'web-101');

  __setTestSession(STU2);
  const res2 = await getNotes();
  const body2 = (await res2.json()) as { notes: { id: string }[] };
  assert.deepEqual(body2.notes.map((n) => n.id), ['note-2']);
});

test('POST /api/student/notes: creates a note owned by the session user; userId in the body is ignored', async () => {
  __setTestSession(STU1);
  const res = await createNoteRoute(jsonReq('http://localhost/api/student/notes', 'POST', {
    title: 'Effects', content: 'useEffect runs after render', userId: 'stu-2',
  }));
  assert.equal(res.status, 201);
  const body = (await res.json()) as { note: { userId: string; title: string } };
  assert.equal(body.note.userId, 'stu-1');
  assert.equal(body.note.title, 'Effects');

  const bad = await createNoteRoute(jsonReq('http://localhost/api/student/notes', 'POST', { title: '', content: 'x' }));
  assert.equal(bad.status, 400);
  const unknownCourse = await createNoteRoute(jsonReq('http://localhost/api/student/notes', 'POST', {
    title: 'x', content: 'y', courseId: 'nope',
  }));
  assert.equal(unknownCourse.status, 404);
});

test('PATCH/DELETE /api/student/notes/[id]: owner only — another student gets 404', async () => {
  __setTestSession(STU2);
  const patchOther = await updateNoteRoute(
    jsonReq('http://localhost/api/student/notes/note-1', 'PATCH', { title: 'Hacked' }),
    { params: Promise.resolve({ id: 'note-1' }) },
  );
  assert.equal(patchOther.status, 404);
  const deleteOther = await deleteNoteRoute(
    new NextRequest('http://localhost/api/student/notes/note-1', { method: 'DELETE' }),
    { params: Promise.resolve({ id: 'note-1' }) },
  );
  assert.equal(deleteOther.status, 404);

  __setTestSession(STU1);
  const patched = await updateNoteRoute(
    jsonReq('http://localhost/api/student/notes/note-1', 'PATCH', { title: 'Hooks v2' }),
    { params: Promise.resolve({ id: 'note-1' }) },
  );
  assert.equal(patched.status, 200);
  const patchedBody = (await patched.json()) as { note: { title: string } };
  assert.equal(patchedBody.note.title, 'Hooks v2');
  const deleted = await deleteNoteRoute(
    new NextRequest('http://localhost/api/student/notes/note-1', { method: 'DELETE' }),
    { params: Promise.resolve({ id: 'note-1' }) },
  );
  assert.equal(deleted.status, 200);
  const after = await getNotes();
  const afterBody = (await after.json()) as { notes: unknown[] };
  assert.deepEqual(afterBody.notes, []);
});

test('notes routes: 401 signed out, 403 for a non-student role', async () => {
  __setTestSession(null);
  assert.equal((await getNotes()).status, 401);
  assert.equal((await createNoteRoute(jsonReq('http://localhost/api/student/notes', 'POST', { title: 'x', content: 'y' }))).status, 401);

  __setTestSession(ADMIN);
  assert.equal((await getNotes()).status, 403);
});

// --- Wishlist: scoping + idempotency ----------------------------------------

test('GET /api/student/wishlist: a student sees only their own entries, with course details', async () => {
  __setTestSession(STU1);
  const empty = (await (await getWishlist()).json()) as { wishlist: unknown[] };
  assert.deepEqual(empty.wishlist, []);

  __setTestSession(STU2);
  const res = await getWishlist();
  assert.equal(res.status, 200);
  const body = (await res.json()) as { wishlist: { id: string; courseId: string; course: { id: string } | null }[] };
  assert.equal(body.wishlist.length, 1);
  assert.equal(body.wishlist[0].id, 'wish-1');
  assert.equal(body.wishlist[0].course?.id, 'course-1');
});

test('POST /api/student/wishlist: duplicate add is idempotent, not an error', async () => {
  __setTestSession(STU1);
  const first = await addWishlistRoute(jsonReq('http://localhost/api/student/wishlist', 'POST', { courseId: 'course-1' }));
  assert.equal(first.status, 201);
  const firstBody = (await first.json()) as { item: { id: string }; duplicate: boolean };
  assert.equal(firstBody.duplicate, false);

  const second = await addWishlistRoute(jsonReq('http://localhost/api/student/wishlist', 'POST', { courseId: 'course-1' }));
  assert.equal(second.status, 200);
  const secondBody = (await second.json()) as { item: { id: string }; duplicate: boolean };
  assert.equal(secondBody.duplicate, true);
  assert.equal(secondBody.item.id, firstBody.item.id);

  const list = (await (await getWishlist()).json()) as { wishlist: unknown[] };
  assert.equal(list.wishlist.length, 1);

  const unknown = await addWishlistRoute(jsonReq('http://localhost/api/student/wishlist', 'POST', { courseId: 'nope' }));
  assert.equal(unknown.status, 404);
});

test('DELETE /api/student/wishlist/[id]: owner only — another student’s entry is 404', async () => {
  __setTestSession(STU1);
  const others = await deleteWishlistRoute(
    new NextRequest('http://localhost/api/student/wishlist/wish-1', { method: 'DELETE' }),
    { params: Promise.resolve({ id: 'wish-1' }) },
  );
  assert.equal(others.status, 404);

  __setTestSession(STU2);
  const mine = await deleteWishlistRoute(
    new NextRequest('http://localhost/api/student/wishlist/wish-1', { method: 'DELETE' }),
    { params: Promise.resolve({ id: 'wish-1' }) },
  );
  assert.equal(mine.status, 200);
  const after = (await (await getWishlist()).json()) as { wishlist: unknown[] };
  assert.deepEqual(after.wishlist, []);
});

test('DELETE /api/student/wishlist/[id]: a course id also removes the entry (heart toggle)', async () => {
  __setTestSession(STU1);
  await addWishlistRoute(jsonReq('http://localhost/api/student/wishlist', 'POST', { courseId: 'course-2' }));
  const removed = await deleteWishlistRoute(
    new NextRequest('http://localhost/api/student/wishlist/course-2', { method: 'DELETE' }),
    { params: Promise.resolve({ id: 'course-2' }) },
  );
  assert.equal(removed.status, 200);
  const again = await deleteWishlistRoute(
    new NextRequest('http://localhost/api/student/wishlist/course-2', { method: 'DELETE' }),
    { params: Promise.resolve({ id: 'course-2' }) },
  );
  assert.equal(again.status, 404);
});

test('wishlist routes: 401 signed out, 403 for a non-student role', async () => {
  __setTestSession(null);
  assert.equal((await getWishlist()).status, 401);
  assert.equal((await addWishlistRoute(jsonReq('http://localhost/api/student/wishlist', 'POST', { courseId: 'course-1' }))).status, 401);

  __setTestSession(ADMIN);
  assert.equal((await getWishlist()).status, 403);
});

// --- Empty states ------------------------------------------------------------

test('empty states: fresh users get empty lists from the APIs, and the pages keep their empty-state copy', async () => {
  const fresh: SessionUser = { id: 'stu-3', name: 'New', email: 'new@example.com', role: 'student' };
  __setTestSession(fresh);
  const notes = (await (await getNotes()).json()) as { notes: unknown[] };
  assert.deepEqual(notes.notes, []);
  const wishlist = (await (await getWishlist()).json()) as { wishlist: unknown[] };
  assert.deepEqual(wishlist.wishlist, []);

  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const notesPage = readFileSync(join(root, 'app/student/notes/page.tsx'), 'utf8');
  assert.match(notesPage, /No notes yet/);
  assert.match(notesPage, /Start creating your learning notes\./);
  assert.match(notesPage, /Create Note/);
  assert.doesNotMatch(notesPage, /INITIAL_NOTES/);
  assert.doesNotMatch(notesPage, /React Hooks Summary/);

  const wishlistClient = readFileSync(join(root, 'app/student/wishlist/student-wishlist-client.tsx'), 'utf8');
  assert.match(wishlistClient, /Your wishlist is empty/);
  assert.match(wishlistClient, /Start adding courses you are interested in\./);
  assert.match(wishlistClient, /Add to Wishlist/);
  assert.doesNotMatch(wishlistClient, /INITIAL_WISHLIST/);

  const wishlistPage = readFileSync(join(root, 'app/student/wishlist/page.tsx'), 'utf8');
  assert.doesNotMatch(wishlistPage, /INITIAL_WISHLIST/);
  assert.doesNotMatch(wishlistPage, /course-3/);
  assert.doesNotMatch(wishlistPage, /course-5/);
});
