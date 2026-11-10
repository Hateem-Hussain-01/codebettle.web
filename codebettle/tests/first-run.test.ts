import test from 'node:test';
import assert from 'node:assert/strict';
import { completeFirstRunSetup, getSetupStatus, isOfficialAdminEmail } from '../lib/services/first-run';
import { login } from '../lib/services/auth-service';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb } from './fake-db';

test.beforeEach(() => {
  __setDbClient(createFakeDb().asClient());
});

test.afterEach(() => {
  __resetDbClient();
});

test('only the two official admin emails can be claimed (case-insensitive)', () => {
  assert.equal(isOfficialAdminEmail('mhateemjutt1412@gmail.com'), true);
  assert.equal(isOfficialAdminEmail('AHMAD.HASSAN.HND@GMAIL.COM'), true);
  assert.equal(isOfficialAdminEmail('admin@codebettle.com'), false);
  assert.equal(isOfficialAdminEmail('someone@example.com'), false);
});

test('setup status starts unclaimed; claiming one admin works and logs in', async () => {
  const before = await getSetupStatus();
  assert.equal(before.complete, false);
  assert.deepEqual(
    before.admins.map((a) => a.claimed),
    [false, false],
  );

  const bad = await completeFirstRunSetup('admin@codebettle.com', 'SomePass123');
  assert.ok('error' in bad, 'the demo admin email must not be claimable');

  const short = await completeFirstRunSetup('mhateemjutt1412@gmail.com', 'short');
  assert.ok('error' in short);

  const claimed = await completeFirstRunSetup('mhateemjutt1412@gmail.com', 'HateemPass123');
  assert.ok('user' in claimed, `expected success, got ${JSON.stringify(claimed)}`);
  assert.equal(claimed.user.role, 'admin');
  assert.equal(claimed.user.name, 'Muhammad Hateem Hussain');
  assert.equal('passwordHash' in claimed.user, false);

  const session = await login('mhateemjutt1412@gmail.com', 'HateemPass123');
  assert.ok(session);
  assert.equal(session.role, 'admin');

  const again = await completeFirstRunSetup('mhateemjutt1412@gmail.com', 'OtherPass123');
  assert.ok('error' in again, 'an account cannot be claimed twice');

  const mid = await getSetupStatus();
  assert.equal(mid.complete, false);
  assert.deepEqual(
    mid.admins.map((a) => a.claimed),
    [true, false],
  );
});

test('setup completes once both official admins have claimed their accounts', async () => {
  assert.ok('user' in (await completeFirstRunSetup('mhateemjutt1412@gmail.com', 'HateemPass123')));
  assert.ok('user' in (await completeFirstRunSetup('ahmad.hassan.hnd@gmail.com', 'AhmadPass123')));
  const status = await getSetupStatus();
  assert.equal(status.complete, true);
  assert.deepEqual(
    status.admins.map((a) => a.claimed),
    [true, true],
  );
});
