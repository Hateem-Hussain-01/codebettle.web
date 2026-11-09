import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import {
  activeSessionCount,
  createSessionRecord,
  revokeAllSessionsForUser,
  revokeSessionToken,
  validateSessionToken,
} from '../lib/db/sessions';
import { createFakeDb } from './fake-db';

const DAY = 24 * 60 * 60 * 1000;

test.beforeEach(() => {
  __setDbClient(createFakeDb().asClient());
});

test.afterEach(() => {
  __resetDbClient();
});

test('a created session validates, and an unknown token does not', async () => {
  const { token } = await createSessionRecord('user-1');
  const record = await validateSessionToken(token);
  assert.ok(record);
  assert.equal(record.userId, 'user-1');
  assert.equal(record.revokedAt, null);
  assert.equal(await validateSessionToken('0'.repeat(64)), null);
  // Tamper with the last character (flip it, so the token is certainly different).
  const tampered = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
  assert.equal(await validateSessionToken(tampered), null);
});

test('revoking one session leaves other sessions of the same user valid', async () => {
  const a = await createSessionRecord('user-1');
  const b = await createSessionRecord('user-1');
  assert.equal(await revokeSessionToken(a.token), true);
  assert.equal(await validateSessionToken(a.token), null);
  assert.ok(await validateSessionToken(b.token));
  assert.equal(await revokeSessionToken(a.token), false); // already revoked
});

test('revokeAllSessionsForUser logs the user out everywhere (suspension path)', async () => {
  const a = await createSessionRecord('user-1');
  const b = await createSessionRecord('user-1');
  const other = await createSessionRecord('user-2');
  assert.equal(await revokeAllSessionsForUser('user-1'), 2);
  assert.equal(await validateSessionToken(a.token), null);
  assert.equal(await validateSessionToken(b.token), null);
  assert.ok(await validateSessionToken(other.token));
});

test('expired sessions are rejected and cleaned up', async () => {
  const now = Date.now();
  const { token } = await createSessionRecord('user-1', { now, ttlMs: 1000 });
  assert.ok(await validateSessionToken(token, now + 500));
  assert.equal(await validateSessionToken(token, now + 1500), null);
  assert.equal(await activeSessionCount(now + 1500), 0);
});

test('validation refreshes lastSeenAt but never extends expiry beyond creation + 7 days', async () => {
  const now = Date.now();
  const { token, record } = await createSessionRecord('user-1', { now });
  const validated = await validateSessionToken(token, now + 2 * DAY);
  assert.ok(validated);
  assert.equal(validated.expiresAt, now + 7 * DAY);
  assert.equal(validated.lastSeenAt, now + 2 * DAY);
  assert.equal(record.expiresAt, now + 7 * DAY);
});
