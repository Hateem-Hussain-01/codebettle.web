import test from 'node:test';
import assert from 'node:assert/strict';
import { __clearRateLimits, checkRateLimit, loginRateLimitKey } from '../lib/rate-limit';

test.beforeEach(() => {
  __clearRateLimits();
});

test('fixed window: first N attempts allowed, then blocked until the window resets', () => {
  const now = Date.now();
  const key = 'login:1.2.3.4:alice@example.com';
  for (let i = 0; i < 5; i += 1) {
    const r = checkRateLimit(key, 5, 15 * 60 * 1000, now);
    assert.equal(r.allowed, true);
    assert.equal(r.remaining, 4 - i);
  }
  const blocked = checkRateLimit(key, 5, 15 * 60 * 1000, now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  // After the window passes, attempts are allowed again.
  const after = checkRateLimit(key, 5, 15 * 60 * 1000, now + 16 * 60 * 1000);
  assert.equal(after.allowed, true);
  assert.equal(after.remaining, 4);
});

test('different keys have independent windows', () => {
  const now = Date.now();
  const a = checkRateLimit('login:1.1.1.1:a@x.com', 1, 60000, now);
  const b = checkRateLimit('login:2.2.2.2:b@x.com', 1, 60000, now);
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, true);
  assert.equal(checkRateLimit('login:1.1.1.1:a@x.com', 1, 60000, now).allowed, false);
  assert.equal(checkRateLimit('login:2.2.2.2:b@x.com', 1, 60000, now).allowed, false);
});

test('loginRateLimitKey is case-insensitive on the email part', () => {
  assert.equal(
    loginRateLimitKey('1.2.3.4', 'Alice@Example.com'),
    loginRateLimitKey('1.2.3.4', 'alice@example.com')
  );
});
