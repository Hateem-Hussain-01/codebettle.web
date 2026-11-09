import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { __clearRateLimits } from '../lib/rate-limit';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  createContactMessage,
  deleteContactMessage,
  getContactMessageById,
  listContactMessages,
  markContactMessageRead,
} from '../lib/db/contact-messages';
import { POST as contactPost } from '../app/api/contact/route';
import { GET as adminList } from '../app/api/admin/messages/route';
import { DELETE as adminDelete, PATCH as adminPatch } from '../app/api/admin/messages/[id]/route';
import type { SessionUser } from '../lib/services/auth-service';

/**
 * Phase 7 — contact form persistence.
 * Before Phase 7 the form faked the send (timeout + toast, nothing
 * stored) even though the ContactMessage model already existed in the
 * contract. Messages are now stored, listed in the admin inbox, and
 * the public route is rate-limited against inbox flooding.
 */

const D = (s: string) => new Date(s);
const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown, ip?: string): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(ip ? { 'x-forwarded-for': ip } : {}),
    },
  });
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  __clearRateLimits();
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
  fake.seed('ContactMessage', [
    { id: 'msg-1', name: 'Ayesha', email: 'ayesha@example.com', subject: 'Fees', message: 'How much?', isRead: false, createdAt: D('2024-05-02') },
    { id: 'msg-2', name: 'Bilal', email: 'bilal@example.com', subject: null, message: 'Hi there', isRead: true, createdAt: D('2024-05-01') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
  __clearRateLimits();
});

// --- Repository ---

test('create stores the message unread; subject is optional', async () => {
  const saved = await createContactMessage({ name: 'Sara', email: 'sara@example.com', message: 'Hello' });
  assert.equal(saved.isRead, false);
  assert.equal(saved.subject, undefined);
  assert.equal(saved.name, 'Sara');
  const again = await getContactMessageById(saved.id);
  assert.equal(again?.email, 'sara@example.com');
});

test('list is newest-first, paginated, and unreadOnly filters', async () => {
  const all = await listContactMessages({});
  assert.equal(all.total, 2);
  assert.equal(all.items[0].id, 'msg-1'); // newer first
  const unread = await listContactMessages({ unreadOnly: true });
  assert.equal(unread.total, 1);
  assert.equal(unread.items[0].id, 'msg-1');
  const page2 = await listContactMessages({ page: '2', limit: '1' });
  assert.equal(page2.items[0].id, 'msg-2');
  assert.equal(page2.hasPrev, true);
});

test('mark read/unread and delete', async () => {
  const read = await markContactMessageRead('msg-1', true);
  assert.equal(read?.isRead, true);
  const unread = await markContactMessageRead('msg-1', false);
  assert.equal(unread?.isRead, false);
  assert.equal(await markContactMessageRead('nope', true), null);
  assert.equal(await deleteContactMessage('msg-2'), true);
  assert.equal(await getContactMessageById('msg-2'), null);
  assert.equal(await deleteContactMessage('msg-2'), false);
});

// --- Public route ---

test('POST /api/contact: 201 stores the message', async () => {
  const res = await contactPost(jsonReq('http://localhost/api/contact', 'POST', {
    name: 'Zara', email: 'zara@example.com', subject: 'Hi', message: 'Question about courses',
  }, '10.0.0.1'));
  assert.equal(res.status, 201);
  const body = await res.json() as { message: { id: string; isRead: boolean } };
  assert.equal(body.message.isRead, false);
  const stored = await getContactMessageById(body.message.id);
  assert.equal(stored?.email, 'zara@example.com');
});

test('POST /api/contact: bad email, empty message and empty name are 400', async () => {
  const cases = [
    { name: 'Zara', email: 'not-an-email', message: 'Hi' },
    { name: 'Zara', email: 'zara@example.com', message: '   ' },
    { name: '', email: 'zara@example.com', message: 'Hi' },
  ];
  for (const body of cases) {
    const res = await contactPost(jsonReq('http://localhost/api/contact', 'POST', body, '10.0.0.2'));
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  // Nothing was stored for the rejected submissions.
  assert.equal((await listContactMessages({})).total, 2);
});

test('POST /api/contact: 6th rapid submission from one IP is 429', async () => {
  for (let i = 0; i < 5; i++) {
    const res = await contactPost(jsonReq('http://localhost/api/contact', 'POST', {
      name: 'Spam', email: 'spam@example.com', message: `msg ${i}`,
    }, '10.0.0.3'));
    assert.equal(res.status, 201);
  }
  const blocked = await contactPost(jsonReq('http://localhost/api/contact', 'POST', {
    name: 'Spam', email: 'spam@example.com', message: 'msg 5',
  }, '10.0.0.3'));
  assert.equal(blocked.status, 429);
  // A different IP is unaffected.
  const other = await contactPost(jsonReq('http://localhost/api/contact', 'POST', {
    name: 'Ok', email: 'ok@example.com', message: 'hello',
  }, '10.0.0.4'));
  assert.equal(other.status, 201);
});

// --- Admin routes ---

test('admin inbox: 401 signed out, 403 student, 200 admin', async () => {
  __setTestSession(null);
  assert.equal((await adminList(new NextRequest('http://localhost/api/admin/messages'))).status, 401);
  __setTestSession(STU1);
  assert.equal((await adminList(new NextRequest('http://localhost/api/admin/messages'))).status, 403);
  __setTestSession(ADMIN);
  const res = await adminList(new NextRequest('http://localhost/api/admin/messages'));
  assert.equal(res.status, 200);
  const body = await res.json() as { messages: { id: string }[]; total: number };
  assert.equal(body.total, 2);
  assert.equal(body.messages[0].id, 'msg-1');
});

test('admin PATCH marks read; DELETE removes; unknown id is 404', async () => {
  __setTestSession(ADMIN);
  const patched = await adminPatch(
    jsonReq('http://localhost/api/admin/messages/msg-1', 'PATCH', { isRead: true }),
    { params: Promise.resolve({ id: 'msg-1' }) },
  );
  assert.equal(patched.status, 200);
  assert.equal((await patched.json() as { message: { isRead: boolean } }).message.isRead, true);

  const missing = await adminPatch(
    jsonReq('http://localhost/api/admin/messages/nope', 'PATCH', { isRead: true }),
    { params: Promise.resolve({ id: 'nope' }) },
  );
  assert.equal(missing.status, 404);

  const deleted = await adminDelete(new NextRequest('http://localhost/api/admin/messages/msg-2', { method: 'DELETE' }), {
    params: Promise.resolve({ id: 'msg-2' }),
  });
  assert.equal(deleted.status, 200);
  assert.equal(await getContactMessageById('msg-2'), null);
});
