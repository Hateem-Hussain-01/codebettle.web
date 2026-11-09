import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { listUsers } from '../lib/db/users';
import type { SessionUser } from '../lib/services/auth-service';

const D = (s: string) => new Date(s);

const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const CSV = [
  'name,email,role,phone',
  'Eve,eve@example.com,student,',
  'Bob,bad-email,student,',
  'Frank,frank@example.com,instructor,0301',
].join('\n');

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

test('non-admin gets 403 and anonymous gets 401', async () => {
  const { POST } = await import('../app/api/admin/users/import/route');

  __setTestSession(STU1);
  const asStudent = await POST(jsonReq('http://localhost/api/admin/users/import', 'POST', { csv: CSV }));
  assert.equal(asStudent.status, 403);

  __setTestSession(null);
  const anon = await POST(jsonReq('http://localhost/api/admin/users/import', 'POST', { csv: CSV }));
  assert.equal(anon.status, 401);
});

test('preview writes nothing (user count unchanged)', async () => {
  const { POST } = await import('../app/api/admin/users/import/route');

  __setTestSession(ADMIN);
  const before = (await listUsers({})).total;
  const res = await POST(jsonReq('http://localhost/api/admin/users/import', 'POST', { csv: CSV }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.totalRows, 3);
  assert.equal(body.validCount, 2);
  assert.equal(body.invalidCount, 1);
  assert.equal((await listUsers({})).total, before);
});

test('confirm writes only valid rows', async () => {
  const { POST } = await import('../app/api/admin/users/import/route');

  __setTestSession(ADMIN);
  const previewRes = await POST(jsonReq('http://localhost/api/admin/users/import', 'POST', { csv: CSV }));
  const preview = await previewRes.json();
  const before = (await listUsers({})).total;

  const confirmRes = await POST(jsonReq('http://localhost/api/admin/users/import', 'POST', {
    csv: CSV, confirm: true, valid: preview.valid,
  }));
  assert.equal(confirmRes.status, 201);
  const body = await confirmRes.json();
  assert.equal(body.importedCount, 2);
  assert.equal(body.skippedCount, 0);
  assert.equal((await listUsers({})).total, before + 2);
  const users = await listUsers({});
  assert.ok(users.items.some((u) => u.email === 'eve@example.com'));
  assert.ok(users.items.some((u) => u.email === 'frank@example.com'));
  assert.ok(!users.items.some((u) => u.email === 'bad-email'));
});

test('confirm without a valid payload is 400', async () => {
  const { POST } = await import('../app/api/admin/users/import/route');

  __setTestSession(ADMIN);
  const res = await POST(jsonReq('http://localhost/api/admin/users/import', 'POST', { csv: CSV, confirm: true }));
  assert.equal(res.status, 400);
});
