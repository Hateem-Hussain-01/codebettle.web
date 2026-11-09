import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { getUnreadCount } from '../lib/db/notifications';
import type { SessionUser } from '../lib/services/auth-service';

const D = (s: string) => new Date(s);

const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };
const STU2: SessionUser = { id: 'stu-2', name: 'Sara', email: 'sara@example.com', role: 'student' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-03') },
  ]);
  fake.seed('Notification', [
    { id: 'notif-1', userId: 'stu-1', type: 'enrollment', title: 'Enrolled', body: 'Welcome', readAt: null, createdAt: D('2024-05-02') },
    { id: 'notif-2', userId: 'stu-1', type: 'certificate', title: 'Certificate', body: 'Issued', readAt: null, createdAt: D('2024-05-01') },
    { id: 'notif-3', userId: 'stu-2', type: 'announcement', title: 'Hello', body: 'Site news', readAt: null, createdAt: D('2024-05-03') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

test('unauthenticated requests get 401 on every notifications route', async () => {
  const { GET } = await import('../app/api/notifications/route');
  const { POST: readAll } = await import('../app/api/notifications/read-all/route');
  const { GET: getPrefs } = await import('../app/api/notifications/preferences/route');

  __setTestSession(null);
  assert.equal((await GET(new NextRequest('http://localhost/api/notifications'))).status, 401);
  assert.equal((await readAll()).status, 401);
  assert.equal((await getPrefs()).status, 401);

  const { POST: read } = await import('../app/api/notifications/[id]/read/route');
  const noAuthRead = await read(jsonReq('http://localhost/api/notifications/notif-1/read', 'POST'), {
    params: Promise.resolve({ id: 'notif-1' }),
  });
  assert.equal(noAuthRead.status, 401);

  const { DELETE } = await import('../app/api/notifications/[id]/route');
  const noAuthDelete = await DELETE(jsonReq('http://localhost/api/notifications/notif-1', 'DELETE'), {
    params: Promise.resolve({ id: 'notif-1' }),
  });
  assert.equal(noAuthDelete.status, 401);
});

test('list returns only the caller’s notifications, newest first, with unread count', async () => {
  const { GET } = await import('../app/api/notifications/route');
  __setTestSession(STU1);
  const res = await GET(new NextRequest('http://localhost/api/notifications'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 2);
  assert.equal(body.unreadCount, 2);
  assert.deepEqual(body.notifications.map((n: { id: string }) => n.id), ['notif-1', 'notif-2']);
  assert.ok(body.notifications.every((n: { userId: string }) => n.userId === 'stu-1'));
});

test('user A cannot read or delete user B’s notification (404, no leak)', async () => {
  const { POST: read } = await import('../app/api/notifications/[id]/read/route');
  const { DELETE } = await import('../app/api/notifications/[id]/route');

  __setTestSession(STU1);
  const readOther = await read(jsonReq('http://localhost/api/notifications/notif-3/read', 'POST'), {
    params: Promise.resolve({ id: 'notif-3' }),
  });
  assert.equal(readOther.status, 404);

  const deleteOther = await DELETE(jsonReq('http://localhost/api/notifications/notif-3', 'DELETE'), {
    params: Promise.resolve({ id: 'notif-3' }),
  });
  assert.equal(deleteOther.status, 404);
  // B's row is untouched.
  assert.equal(await getUnreadCount('stu-2'), 1);

  // A missing id is 404 too.
  const readGhost = await read(jsonReq('http://localhost/api/notifications/ghost/read', 'POST'), {
    params: Promise.resolve({ id: 'ghost' }),
  });
  assert.equal(readGhost.status, 404);
});

test('mark-read sets readAt; delete removes only the caller’s row', async () => {
  const { POST: read } = await import('../app/api/notifications/[id]/read/route');
  const { DELETE } = await import('../app/api/notifications/[id]/route');

  __setTestSession(STU1);
  const marked = await read(jsonReq('http://localhost/api/notifications/notif-1/read', 'POST'), {
    params: Promise.resolve({ id: 'notif-1' }),
  });
  assert.equal(marked.status, 200);
  const markedBody = await marked.json();
  assert.ok(markedBody.notification.readAt, JSON.stringify(markedBody));
  assert.equal(await getUnreadCount('stu-1'), 1);

  // Idempotent: reading again still 200.
  const again = await read(jsonReq('http://localhost/api/notifications/notif-1/read', 'POST'), {
    params: Promise.resolve({ id: 'notif-1' }),
  });
  assert.equal(again.status, 200);

  const deleted = await DELETE(jsonReq('http://localhost/api/notifications/notif-2', 'DELETE'), {
    params: Promise.resolve({ id: 'notif-2' }),
  });
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).success, true);
  assert.equal(await getUnreadCount('stu-1'), 0);

  // Second delete is 404.
  const againDelete = await DELETE(jsonReq('http://localhost/api/notifications/notif-2', 'DELETE'), {
    params: Promise.resolve({ id: 'notif-2' }),
  });
  assert.equal(againDelete.status, 404);
});

test('read-all marks only the caller’s rows', async () => {
  const { POST: readAll } = await import('../app/api/notifications/read-all/route');
  __setTestSession(STU1);
  const res = await readAll();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).marked, 2);
  assert.equal(await getUnreadCount('stu-1'), 0);
  // The other user's row is untouched.
  assert.equal(await getUnreadCount('stu-2'), 1);
});

test('preferences: GET returns defaults; PUT rejects unknown keys and non-booleans, persists valid ones', async () => {
  const { GET, PUT } = await import('../app/api/notifications/preferences/route');

  __setTestSession(STU1);
  const defaults = await GET();
  assert.equal(defaults.status, 200);
  assert.deepEqual(await defaults.json(), {
    preferences: {
      inApp: true,
      email: false,
      events: { enrollment: true, completion: true, certificate: true, application: true, announcement: true },
    },
  });

  const unknownKey = await PUT(jsonReq('http://localhost/api/notifications/preferences', 'PUT', { bogus: true }));
  assert.equal(unknownKey.status, 400);

  const unknownEvent = await PUT(
    jsonReq('http://localhost/api/notifications/preferences', 'PUT', { events: { bogus: true } }),
  );
  assert.equal(unknownEvent.status, 400);

  const nonBoolean = await PUT(jsonReq('http://localhost/api/notifications/preferences', 'PUT', { inApp: 'yes' }));
  assert.equal(nonBoolean.status, 400);

  const nonBooleanEvent = await PUT(
    jsonReq('http://localhost/api/notifications/preferences', 'PUT', { events: { certificate: 1 } }),
  );
  assert.equal(nonBooleanEvent.status, 400);

  // A failed PUT leaves the stored prefs unchanged.
  assert.deepEqual((await (await GET()).json()).preferences.events.certificate, true);

  const partial = await PUT(
    jsonReq('http://localhost/api/notifications/preferences', 'PUT', { events: { certificate: false } }),
  );
  assert.equal(partial.status, 200);
  const partialBody = await partial.json();
  assert.equal(partialBody.preferences.events.certificate, false);
  assert.equal(partialBody.preferences.events.enrollment, true);
  assert.equal(partialBody.preferences.inApp, true);

  const full = await PUT(
    jsonReq('http://localhost/api/notifications/preferences', 'PUT', {
      inApp: true,
      email: true,
      events: { enrollment: false, completion: true, certificate: false, application: true, announcement: true },
    }),
  );
  assert.equal(full.status, 200);
  const fullBody = await full.json();
  assert.equal(fullBody.preferences.email, true);
  assert.equal(fullBody.preferences.events.enrollment, false);
});
