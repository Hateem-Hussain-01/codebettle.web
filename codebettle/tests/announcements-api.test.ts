import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { POST as adminCreate } from '../app/api/admin/announcements/route';
import { DELETE as adminDelete } from '../app/api/admin/announcements/[id]/route';
import { POST as instructorCreate } from '../app/api/instructor/announcements/route';
import { DELETE as instructorDelete } from '../app/api/instructor/announcements/[id]/route';
import { listAnnouncements } from '../lib/db/announcements';
import type { SessionUser } from '../lib/services/auth-service';

/**
 * Phase 7 — real announcement write APIs.
 * Before Phase 7 the admin and instructor announcement pages faked
 * create/delete in local state (setTimeout + toast), even though the
 * admin POST route already existed. Both pages are now wired to real
 * routes, and deletes exist for both roles with ownership checks.
 */

const D = (s: string) => new Date(s);
const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const INST1: SessionUser = { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', role: 'instructor' };
const INST2: SessionUser = { id: 'inst-2', name: 'Sara', email: 'sara@codebettle.com', role: 'instructor' };
const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function course(id: string, instructorId: string) {
  return {
    id, slug: id, title: id, description: 'Intro', longDescription: 'Long',
    thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
    instructorId, zoomLink: null, schedule: null, status: 'published',
    isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
    tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
    createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
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
  fake.seed('Course', [course('course-1', 'inst-1'), course('course-2', 'inst-2')]);
  fake.seed('Announcement', [
    { id: 'ann-1', title: 'Week 1', content: 'Welcome', type: 'course', courseId: 'course-1', authorId: 'inst-1', isActive: true, createdAt: D('2024-05-01') },
    { id: 'ann-2', title: 'Week 1', content: 'Hi', type: 'course', courseId: 'course-2', authorId: 'inst-2', isActive: true, createdAt: D('2024-05-01') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

test('admin POST creates a site-wide announcement; DELETE removes it, then 404s', async () => {
  __setTestSession(ADMIN);
  const created = await adminCreate(jsonReq('http://localhost/api/admin/announcements', 'POST', {
    title: 'Holiday', content: 'No classes Friday', type: 'site-wide',
  }));
  assert.equal(created.status, 201);
  const body = await created.json() as { announcement: { id: string; type: string } };
  assert.equal(body.announcement.type, 'site-wide');
  assert.equal((await listAnnouncements()).length, 3);

  const deleted = await adminDelete(new NextRequest(`http://localhost/api/admin/announcements/${body.announcement.id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id: body.announcement.id }),
  });
  assert.equal(deleted.status, 200);
  assert.equal((await listAnnouncements()).length, 2);
  const again = await adminDelete(new NextRequest(`http://localhost/api/admin/announcements/${body.announcement.id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id: body.announcement.id }),
  });
  assert.equal(again.status, 404);
});

test('admin routes reject non-admins and signed-out users', async () => {
  __setTestSession(INST1);
  const asInstructor = await adminCreate(jsonReq('http://localhost/api/admin/announcements', 'POST', {
    title: 'x', content: 'y', type: 'site-wide',
  }));
  assert.equal(asInstructor.status, 403);
  __setTestSession(null);
  const anon = await adminDelete(new NextRequest('http://localhost/api/admin/announcements/ann-1', { method: 'DELETE' }), {
    params: Promise.resolve({ id: 'ann-1' }),
  });
  assert.equal(anon.status, 401);
});

test('instructor POST to their own course works; to another instructor’s course is 403', async () => {
  __setTestSession(INST1);
  const ok = await instructorCreate(jsonReq('http://localhost/api/instructor/announcements', 'POST', {
    title: 'Quiz moved', content: 'Quiz is now Thursday', courseId: 'course-1',
  }));
  assert.equal(ok.status, 201);
  const body = await ok.json() as { announcement: { type: string; courseId: string; authorId: string } };
  assert.equal(body.announcement.type, 'course');
  assert.equal(body.announcement.courseId, 'course-1');
  assert.equal(body.announcement.authorId, 'inst-1');

  const forbidden = await instructorCreate(jsonReq('http://localhost/api/instructor/announcements', 'POST', {
    title: 'Hijack', content: 'Not my course', courseId: 'course-2',
  }));
  assert.equal(forbidden.status, 403);

  const unknown = await instructorCreate(jsonReq('http://localhost/api/instructor/announcements', 'POST', {
    title: 'x', content: 'y', courseId: 'nope',
  }));
  assert.equal(unknown.status, 404);

  __setTestSession(STU1);
  const asStudent = await instructorCreate(jsonReq('http://localhost/api/instructor/announcements', 'POST', {
    title: 'x', content: 'y', courseId: 'course-1',
  }));
  assert.equal(asStudent.status, 403);
});

test('instructor DELETE: own announcement 200, another instructor’s 403, unknown 404', async () => {
  __setTestSession(INST1);
  const others = await instructorDelete(new NextRequest('http://localhost/api/instructor/announcements/ann-2', { method: 'DELETE' }), {
    params: Promise.resolve({ id: 'ann-2' }),
  });
  assert.equal(others.status, 403);
  const missing = await instructorDelete(new NextRequest('http://localhost/api/instructor/announcements/nope', { method: 'DELETE' }), {
    params: Promise.resolve({ id: 'nope' }),
  });
  assert.equal(missing.status, 404);
  const mine = await instructorDelete(new NextRequest('http://localhost/api/instructor/announcements/ann-1', { method: 'DELETE' }), {
    params: Promise.resolve({ id: 'ann-1' }),
  });
  assert.equal(mine.status, 200);
  assert.equal((await listAnnouncements()).length, 1);
});
