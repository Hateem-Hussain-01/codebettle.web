import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSessionToken,
  getSafeRedirect,
  hashPassword,
  hashToken,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from '../lib/security';

test('hashPassword produces a bcrypt hash that verifies, and differs per call (salt)', async () => {
  const a = await hashPassword('CorrectHorse123');
  const b = await hashPassword('CorrectHorse123');
  assert.match(a, /^\$2[aby]\$12\$/);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('CorrectHorse123', a), true);
  assert.equal(await verifyPassword('CorrectHorse123', b), true);
  assert.equal(await verifyPassword('wrong-password', a), false);
});

test('verifyPassword never throws on a malformed stored hash', async () => {
  assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
  assert.equal(await verifyPassword('anything', ''), false);
});

test('validatePassword enforces the 8-character minimum', () => {
  assert.equal(validatePassword('short'), 'Password must be at least 8 characters');
  assert.equal(validatePassword('1234567'), 'Password must be at least 8 characters');
  assert.equal(validatePassword('12345678'), null);
});

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  ALI@Example.COM '), 'ali@example.com');
});

test('session tokens are unique 64-char hex; only their hash is stored', () => {
  const t1 = generateSessionToken();
  const t2 = generateSessionToken();
  assert.match(t1, /^[0-9a-f]{64}$/);
  assert.notEqual(t1, t2);
  assert.equal(hashToken(t1), hashToken(t1));
  assert.notEqual(hashToken(t1), t1);
  assert.notEqual(hashToken(t1), hashToken(t2));
});

test('getSafeRedirect allows same-origin relative paths only', () => {
  assert.equal(getSafeRedirect('/student/dashboard', '/'), '/student/dashboard');
  assert.equal(getSafeRedirect('/admin/courses?page=2', '/'), '/admin/courses?page=2');
  assert.equal(getSafeRedirect('//evil.com/phish', '/'), '/');
  assert.equal(getSafeRedirect('https://evil.com/x', '/'), '/');
  assert.equal(getSafeRedirect('javascript:alert(1)', '/'), '/');
  assert.equal(getSafeRedirect('/\\evil.com', '/'), '/');
  assert.equal(getSafeRedirect(null, '/fallback'), '/fallback');
  assert.equal(getSafeRedirect('', '/fallback'), '/fallback');
});
