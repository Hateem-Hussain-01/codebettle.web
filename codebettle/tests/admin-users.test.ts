import test from 'node:test';
import assert from 'node:assert/strict';
import { createManagedUser, deleteManagedUser, setUserStatus } from '../lib/admin-users';
import { login } from '../lib/auth-core';
import { getUserByEmail } from '../lib/db/users';
import { createSessionRecord, validateSessionToken } from '../lib/db/sessions';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const testEmail = (tag: string) => `test-admin-${tag}-${suffix()}@example.com`;

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  // The acting admin (the tests call the service as 'admin-1').
  fake.seed('User', [
    {
      id: 'admin-1',
      name: 'Admin One',
      email: 'admin-1@example.com',
      passwordHash: '$2b$12$dummyhashdummyhashdummyhashdummyhashdummyhashdummyha',
      role: 'admin',
      status: 'active',
      joinedAt: new Date('2024-01-01'),
    },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

test('admin can create a student; the account logs in and the hash is never returned', async () => {
  const email = testEmail('create');
  const created = await createManagedUser('admin-1', {
    name: 'Managed Student',
    email,
    password: 'Managed123',
    role: 'student',
  });
  assert.ok('user' in created, `expected success, got ${JSON.stringify(created)}`);
  assert.equal(created.user.role, 'student');
  assert.equal('passwordHash' in created.user, false);
  assert.ok(await login(email, 'Managed123'));

  const dupe = await createManagedUser('admin-1', { name: 'X', email, password: 'Managed123' });
  assert.ok('error' in dupe);
  const short = await createManagedUser('admin-1', {
    name: 'X',
    email: testEmail('short'),
    password: 'short',
  });
  assert.ok('error' in short);
});

test('suspending a user revokes their sessions immediately; self-suspension is refused', async () => {
  const email = testEmail('suspend');
  const created = await createManagedUser('admin-1', {
    name: 'Suspendable',
    email,
    password: 'Suspend123',
  });
  assert.ok('user' in created);
  const userId = created.user.id;

  const { token } = await createSessionRecord(userId);
  assert.ok(await validateSessionToken(token));

  const result = await setUserStatus('admin-1', userId, 'suspended');
  assert.ok('status' in result);
  assert.equal(result.status, 'suspended');
  assert.equal(await validateSessionToken(token), null);
  assert.equal(await login(email, 'Suspend123'), null);

  const reactivated = await setUserStatus('admin-1', userId, 'active');
  assert.ok('status' in reactivated);
  assert.ok(await login(email, 'Suspend123'));

  const selfSuspend = await setUserStatus('admin-1', 'admin-1', 'suspended');
  assert.ok('error' in selfSuspend);

  const missing = await setUserStatus('admin-1', 'no-such-user', 'suspended');
  assert.ok('error' in missing);
});

test('deleting a user soft-deletes the record and revokes sessions; self-delete is refused', async () => {
  const email = testEmail('delete');
  const created = await createManagedUser('admin-1', {
    name: 'Deletable',
    email,
    password: 'Delete123',
  });
  assert.ok('user' in created);
  const userId = created.user.id;
  const { token } = await createSessionRecord(userId);
  assert.ok(await validateSessionToken(token));

  const selfDelete = await deleteManagedUser('admin-1', 'admin-1');
  assert.ok('error' in selfDelete);

  const removed = await deleteManagedUser('admin-1', userId);
  assert.ok('success' in removed);
  // Soft-deleted: the row stays in the database, but every read hides it.
  assert.equal(await getUserByEmail(email), null);
  assert.equal(await validateSessionToken(token), null);
  assert.equal(await login(email, 'Delete123'), null);
  const stored = fake.tables.User?.get(userId);
  assert.ok(stored);
  assert.ok((stored as { deletedAt: Date | null }).deletedAt instanceof Date);
});
