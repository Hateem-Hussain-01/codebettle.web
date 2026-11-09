import test from 'node:test';
import assert from 'node:assert/strict';
import { createManagedUser, deleteManagedUser, setUserStatus } from '../lib/admin-users';
import { login } from '../lib/auth-core';
import { getUserByEmail } from '../lib/data/users';
import { createSessionRecord, validateSessionToken } from '../lib/session-store';

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const testEmail = (tag: string) => `test-admin-${tag}-${suffix()}@example.com`;

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

  const { token } = createSessionRecord(userId);
  assert.ok(validateSessionToken(token));

  const result = setUserStatus('admin-1', userId, 'suspended');
  assert.ok('status' in result);
  assert.equal(result.status, 'suspended');
  assert.equal(validateSessionToken(token), null);
  assert.equal(await login(email, 'Suspend123'), null);

  const reactivated = setUserStatus('admin-1', userId, 'active');
  assert.ok('status' in reactivated);
  assert.ok(await login(email, 'Suspend123'));

  const selfSuspend = setUserStatus('admin-1', 'admin-1', 'suspended');
  assert.ok('error' in selfSuspend);

  const missing = setUserStatus('admin-1', 'no-such-user', 'suspended');
  assert.ok('error' in missing);
});

test('deleting a user removes the record and revokes sessions; self-delete is refused', async () => {
  const email = testEmail('delete');
  const created = await createManagedUser('admin-1', {
    name: 'Deletable',
    email,
    password: 'Delete123',
  });
  assert.ok('user' in created);
  const userId = created.user.id;
  const { token } = createSessionRecord(userId);
  assert.ok(validateSessionToken(token));

  const selfDelete = deleteManagedUser('admin-1', 'admin-1');
  assert.ok('error' in selfDelete);

  const removed = deleteManagedUser('admin-1', userId);
  assert.ok('success' in removed);
  assert.equal(getUserByEmail(email), undefined);
  assert.equal(validateSessionToken(token), null);
  assert.equal(await login(email, 'Delete123'), null);
});
