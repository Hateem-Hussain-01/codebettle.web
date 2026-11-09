import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { getApplicationById, listApplications } from '../lib/db/applications';
import { reviewApplicationService, submitApplication } from '../lib/services/application-service';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('InstructorApplication', [
    { id: 'app-old', name: 'Old One', email: 'old@example.com', phone: null, expertise: 'React', experience: '3 years', message: 'I love teaching React.', status: 'approved', reviewedBy: 'admin-1', createdAt: D('2024-04-01') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

test('submit stores the message (trimmed) and it round-trips through list and get', async () => {
  const created = await submitApplication({
    name: 'New Teacher',
    email: 'teacher@example.com',
    expertise: 'Python',
    experience: '5 years',
    message: '  I want to teach because I love helping students.  ',
  });
  assert.ok('application' in created, JSON.stringify(created));
  assert.equal(created.application.message, 'I want to teach because I love helping students.');
  assert.equal(created.application.status, 'pending');

  const listed = await listApplications({ status: 'pending' });
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0]?.message, 'I want to teach because I love helping students.');

  const byId = await getApplicationById(created.application.id);
  assert.equal(byId?.message, 'I want to teach because I love helping students.');
});

test('submit without a message stores none (undefined, not an empty string)', async () => {
  const created = await submitApplication({ name: 'No Message', email: 'nomsg@example.com' });
  assert.ok('application' in created, JSON.stringify(created));
  assert.equal(created.application.message, undefined);

  const byId = await getApplicationById(created.application.id);
  assert.equal(byId?.message, undefined);
});

test('seeded applications keep their stored message', async () => {
  const byId = await getApplicationById('app-old');
  assert.equal(byId?.message, 'I love teaching React.');
  assert.equal(byId?.status, 'approved');
});

test('pending -> approved records the reviewer and keeps the message', async () => {
  const submitted = await submitApplication({
    name: 'T',
    email: 't@example.com',
    message: 'Teach all the things.',
  });
  assert.ok('application' in submitted, JSON.stringify(submitted));

  const approved = await reviewApplicationService(ADMIN, submitted.application.id, 'approved');
  assert.ok('application' in approved, JSON.stringify(approved));
  assert.equal(approved.application.status, 'approved');
  assert.equal(approved.application.reviewedBy, 'admin-1');
  assert.equal(approved.application.message, 'Teach all the things.');
});

test('pending -> rejected works', async () => {
  const submitted = await submitApplication({ name: 'R', email: 'r@example.com', message: 'Please let me teach.' });
  assert.ok('application' in submitted, JSON.stringify(submitted));

  const rejected = await reviewApplicationService(ADMIN, submitted.application.id, 'rejected');
  assert.ok('application' in rejected, JSON.stringify(rejected));
  assert.equal(rejected.application.status, 'rejected');
  assert.equal(rejected.application.reviewedBy, 'admin-1');
  assert.equal(rejected.application.message, 'Please let me teach.');
});

test('re-review is rejected after approval and after rejection', async () => {
  const a = await submitApplication({ name: 'A', email: 'a@example.com' });
  assert.ok('application' in a, JSON.stringify(a));
  const approved = await reviewApplicationService(ADMIN, a.application.id, 'approved');
  assert.ok('application' in approved, JSON.stringify(approved));
  const againAfterApprove = await reviewApplicationService(ADMIN, a.application.id, 'rejected');
  assert.ok('error' in againAfterApprove && againAfterApprove.status === 400, JSON.stringify(againAfterApprove));

  const b = await submitApplication({ name: 'B', email: 'b@example.com' });
  assert.ok('application' in b, JSON.stringify(b));
  const rejected = await reviewApplicationService(ADMIN, b.application.id, 'rejected');
  assert.ok('application' in rejected, JSON.stringify(rejected));
  const againAfterReject = await reviewApplicationService(ADMIN, b.application.id, 'approved');
  assert.ok('error' in againAfterReject && againAfterReject.status === 400, JSON.stringify(againAfterReject));
});
