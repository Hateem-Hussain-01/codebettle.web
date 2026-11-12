import test from 'node:test';
import assert from 'node:assert/strict';
import { changePassword, login, registerUser } from '../lib/auth-core';
import { createApplication, getApplicationByEmail } from '../lib/db/applications';
import { getUserByEmail } from '../lib/db/users';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb } from './fake-db';

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const testEmail = (tag: string) => `test-${tag}-${suffix()}@example.com`;

test.beforeEach(() => {
  __setDbClient(createFakeDb().asClient());
});

test.afterEach(() => {
  __resetDbClient();
});

test('register -> login round-trips with a bcrypt hash; wrong password and unknown email fail', async () => {
  const email = testEmail('register');
  const created = await registerUser({
    name: 'Test Learner',
    email,
    password: 'TestPass123',
  });
  assert.ok('user' in created, `expected success, got ${JSON.stringify(created)}`);
  assert.equal(created.user.role, 'student');
  assert.equal('passwordHash' in created.user, false);

  const stored = await getUserByEmail(email);
  assert.ok(stored);
  assert.match(stored.passwordHash, /^\$2[aby]\$12\$/);

  const session = await login(email, 'TestPass123');
  assert.ok(session);
  assert.equal(session.email, email);
  assert.equal(session.role, 'student');

  assert.equal(await login(email, 'WrongPass123'), null);
  assert.equal(await login('nobody@example.com', 'TestPass123'), null);
  // Email lookup is case-insensitive.
  assert.ok(await login(email.toUpperCase(), 'TestPass123'));
});

test('register links a pre-existing unlinked instructor application filed under the same email', async () => {
  const email = testEmail('link');
  // Filed via the public become-instructor form before any account existed.
  const unlinked = await createApplication({ name: 'Future Teacher', email });
  assert.equal(unlinked.userId, undefined);
  // Other rows must be untouched: a different email, and one already linked.
  const other = await createApplication({ name: 'Other Person', email: testEmail('other') });
  const alreadyLinked = await createApplication({
    name: 'Taken', email: testEmail('taken'), userId: 'someone-else',
  });

  const created = await registerUser({ name: 'Future Teacher', email, password: 'TestPass123' });
  assert.ok('user' in created, `expected success, got ${JSON.stringify(created)}`);

  const linked = await getApplicationByEmail(email);
  assert.ok(linked);
  assert.equal(linked.userId, created.user.id);

  assert.equal((await getApplicationByEmail(other.email))?.userId, undefined);
  assert.equal((await getApplicationByEmail(alreadyLinked.email))?.userId, 'someone-else');
});

test('register rejects duplicates, bad emails and short passwords', async () => {
  const email = testEmail('dupe');
  assert.ok('user' in (await registerUser({ name: 'A', email, password: 'TestPass123' })));
  const dupe = await registerUser({ name: 'B', email, password: 'TestPass123' });
  assert.ok('error' in dupe);

  const badEmail = await registerUser({ name: 'C', email: 'not-an-email', password: 'TestPass123' });
  assert.ok('error' in badEmail);

  const short = await registerUser({ name: 'D', email: testEmail('short'), password: 'short' });
  assert.ok('error' in short);
  assert.match(short.error, /at least 8 characters/);
});

test('changePassword requires the current password; the old password stops working', async () => {
  const email = testEmail('changepw');
  const created = await registerUser({ name: 'Changer', email, password: 'OldPass123' });
  assert.ok('user' in created);
  const userId = created.user.id;

  const wrongCurrent = await changePassword(userId, 'NotThePassword', 'NewPass123');
  assert.ok('error' in wrongCurrent);

  const short = await changePassword(userId, 'OldPass123', 'short');
  assert.ok('error' in short);

  const changed = await changePassword(userId, 'OldPass123', 'NewPass123');
  assert.ok('token' in changed);

  assert.equal(await login(email, 'OldPass123'), null);
  const session = await login(email, 'NewPass123');
  assert.ok(session);
});
