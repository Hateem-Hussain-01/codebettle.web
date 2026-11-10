import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { listApplications } from '../lib/db/applications';
import { reviewApplicationService, submitApplication } from '../lib/services/application-service';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };
const STUDENT: Actor = { id: 'stu-1', role: 'student', name: 'Ali' };

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
  fake.seed('InstructorApplication', [
    { id: 'app-1', name: 'Old One', email: 'old@example.com', phone: null, expertise: 'React', experience: '3 years', status: 'approved', reviewedBy: 'admin-1', createdAt: D('2024-04-01') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

test('public submit creates a pending application with a normalised email', async () => {
  const created = await submitApplication({
    name: '  New Teacher ',
    email: '  New@Example.COM ',
    phone: '0300 1234567',
    expertise: 'Python',
    experience: '5 years',
  });
  assert.ok('application' in created, JSON.stringify(created));
  assert.equal(created.application.status, 'pending');
  assert.equal(created.application.email, 'new@example.com');
  assert.equal(created.application.name, 'New Teacher');
  assert.equal(created.application.reviewedBy, undefined);
});

test('submit validates name and email', async () => {
  const noName = await submitApplication({ name: '   ', email: 'a@example.com' });
  assert.ok('error' in noName && noName.status === 400, JSON.stringify(noName));

  const badEmail = await submitApplication({ name: 'X', email: 'not-an-email' });
  assert.ok('error' in badEmail && badEmail.status === 400, JSON.stringify(badEmail));
});

test('admin approves; the reviewer is recorded; re-review is rejected', async () => {
  const submitted = await submitApplication({ name: 'T', email: 't@example.com' });
  assert.ok('application' in submitted, JSON.stringify(submitted));

  const approved = await reviewApplicationService(ADMIN, submitted.application.id, 'approved');
  assert.ok('application' in approved, JSON.stringify(approved));
  assert.equal(approved.application.status, 'approved');
  assert.equal(approved.application.reviewedBy, 'admin-1');

  const again = await reviewApplicationService(ADMIN, submitted.application.id, 'rejected');
  assert.ok('error' in again && again.status === 400, JSON.stringify(again));
});

test('review rejects non-admins and missing applications', async () => {
  const submitted = await submitApplication({ name: 'T', email: 't2@example.com' });
  assert.ok('application' in submitted, JSON.stringify(submitted));

  const asStudent = await reviewApplicationService(STUDENT, submitted.application.id, 'approved');
  assert.ok('error' in asStudent && asStudent.status === 403, JSON.stringify(asStudent));

  const missing = await reviewApplicationService(ADMIN, 'ghost', 'approved');
  assert.ok('error' in missing && missing.status === 404, JSON.stringify(missing));
});

test('listApplications filters by status and paginates', async () => {
  await submitApplication({ name: 'P1', email: 'p1@example.com' });
  await submitApplication({ name: 'P2', email: 'p2@example.com' });
  const pending = await listApplications({ status: 'pending' });
  assert.equal(pending.total, 2);
  const approved = await listApplications({ status: 'approved' });
  assert.equal(approved.total, 1);
  const page1 = await listApplications({ limit: '2' });
  assert.equal(page1.items.length, 2);
  assert.equal(page1.totalPages, 2);
});
