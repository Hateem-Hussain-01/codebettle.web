import test from 'node:test';
import assert from 'node:assert/strict';
import { registerUser, login } from '../lib/services/auth-service';
import {
  hashResetToken,
  requestPasswordReset,
  resetPassword,
} from '../lib/services/password-reset-service';
import { findPasswordResetByTokenHash } from '../lib/db/password-resets';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb } from './fake-db';

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.beforeEach(() => {
  __setDbClient(createFakeDb().asClient());
});

test.afterEach(() => {
  __resetDbClient();
});

async function makeUser(tag: string): Promise<string> {
  const email = `reset-${tag}-${suffix()}@example.com`;
  const created = await registerUser({ name: 'Reset User', email, password: 'OldPass123' });
  assert.ok('user' in created);
  return email;
}

/** Request a reset and capture the delivered token. */
async function requestWithCapture(email: string): Promise<string> {
  let captured = '';
  const result = await requestPasswordReset(email, {
    deliver: async (_to, token) => {
      captured = token;
    },
  });
  assert.ok(result.ok);
  assert.ok(captured, 'expected a token to be delivered');
  return captured;
}

test('request -> reset round-trips; the token is single-use and hashed at rest', async () => {
  const email = await makeUser('roundtrip');
  const token = await requestWithCapture(email);

  // Only the hash is stored, never the raw token.
  const stored = await findPasswordResetByTokenHash(hashResetToken(token));
  assert.ok(stored);
  assert.notEqual((stored as unknown as { token?: string }).token, token);

  const reset = await resetPassword(token, 'NewPass123');
  assert.ok('success' in reset);
  assert.equal(await login(email, 'OldPass123'), null);
  assert.ok(await login(email, 'NewPass123'));

  // The same token cannot be used twice.
  const reuse = await resetPassword(token, 'AnotherPass123');
  assert.ok('error' in reuse);
  assert.ok(await login(email, 'NewPass123'));
});

test('unknown tokens and unknown emails fail generically (no enumeration)', async () => {
  const email = await makeUser('unknown');
  // Unknown email: same ok response, no token delivered.
  let delivered = false;
  const result = await requestPasswordReset('nobody@example.com', {
    deliver: async () => {
      delivered = true;
    },
  });
  assert.ok(result.ok);
  assert.equal(delivered, false);

  assert.ok('error' in (await resetPassword('0'.repeat(64), 'NewPass123')));
  assert.ok(await login(email, 'OldPass123'), 'the real account is untouched');
});

test('an expired token is rejected', async () => {
  const email = await makeUser('expired');
  const now = Date.now();
  const token = await requestWithCapture(email);
  // 61 minutes later — past the 60-minute TTL.
  const late = await resetPassword(token, 'NewPass123', { now: now + 61 * 60 * 1000 });
  assert.ok('error' in late);
  assert.ok(await login(email, 'OldPass123'));
});

test('a second request invalidates the first token', async () => {
  const email = await makeUser('second');
  const first = await requestWithCapture(email);
  const second = await requestWithCapture(email);
  assert.notEqual(first, second);
  assert.ok('error' in (await resetPassword(first, 'NewPass123')));
  assert.ok('success' in (await resetPassword(second, 'NewPass123')));
});

test('reset validates the new password', async () => {
  const email = await makeUser('short');
  const token = await requestWithCapture(email);
  const result = await resetPassword(token, 'short');
  assert.ok('error' in result);
  assert.ok(await login(email, 'OldPass123'));
});
