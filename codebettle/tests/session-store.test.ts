import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __clearSessionStore,
  activeSessionCount,
  createSessionRecord,
  revokeAllSessionsForUser,
  revokeSessionToken,
  validateSessionToken,
} from '../lib/session-store';

const DAY = 24 * 60 * 60 * 1000;

test.beforeEach(() => {
  __clearSessionStore();
});

test('a created session validates, and an unknown token does not', () => {
  const { token } = createSessionRecord('user-1');
  const record = validateSessionToken(token);
  assert.ok(record);
  assert.equal(record.userId, 'user-1');
  assert.equal(record.revokedAt, null);
  assert.equal(validateSessionToken('0'.repeat(64)), null);
  assert.equal(validateSessionToken(token.slice(0, -1) + '0'), null);
});

test('revoking one session leaves other sessions of the same user valid', () => {
  const a = createSessionRecord('user-1');
  const b = createSessionRecord('user-1');
  assert.equal(revokeSessionToken(a.token), true);
  assert.equal(validateSessionToken(a.token), null);
  assert.ok(validateSessionToken(b.token));
  assert.equal(revokeSessionToken(a.token), false); // already revoked
});

test('revokeAllSessionsForUser logs the user out everywhere (suspension path)', () => {
  const a = createSessionRecord('user-1');
  const b = createSessionRecord('user-1');
  const other = createSessionRecord('user-2');
  assert.equal(revokeAllSessionsForUser('user-1'), 2);
  assert.equal(validateSessionToken(a.token), null);
  assert.equal(validateSessionToken(b.token), null);
  assert.ok(validateSessionToken(other.token));
});

test('expired sessions are rejected and cleaned up', () => {
  const now = Date.now();
  const { token } = createSessionRecord('user-1', { now, ttlMs: 1000 });
  assert.ok(validateSessionToken(token, now + 500));
  assert.equal(validateSessionToken(token, now + 1500), null);
  assert.equal(activeSessionCount(now + 1500), 0);
});

test('validation refreshes lastSeenAt but never extends expiry beyond creation + 7 days', () => {
  const now = Date.now();
  const { token, record } = createSessionRecord('user-1', { now });
  const validated = validateSessionToken(token, now + 2 * DAY);
  assert.ok(validated);
  assert.equal(validated.expiresAt, now + 7 * DAY);
  assert.equal(validated.lastSeenAt, now + 2 * DAY);
  assert.equal(record.expiresAt, now + 7 * DAY);
});
