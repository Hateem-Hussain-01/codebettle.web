import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { buildCspHeader, generateNonce } from '../lib/security';
import { proxy } from '../proxy';

/**
 * Phase 7 — nonce Content-Security-Policy (SEC-09 fix).
 * Before Phase 7 there was no CSP at all. Now every page request gets
 * a fresh nonce and a CSP header; Next.js stamps the nonce on its own
 * inline scripts during server rendering.
 */

function nonceOf(csp: string | null): string | null {
  if (!csp) return null;
  const m = csp.match(/'nonce-([^']+)'/);
  return m ? m[1] : null;
}

test('buildCspHeader locks scripts to the nonce + strict-dynamic', () => {
  const csp = buildCspHeader('abc123');
  assert.ok(csp.includes("script-src 'self' 'nonce-abc123' 'strict-dynamic'"), csp);
  assert.equal(csp.includes('unsafe-eval'), false, csp);
  assert.equal(csp.includes("script-src 'self' 'unsafe-inline'"), false, csp);
});

test('dev builds add unsafe-eval (React needs it for dev error stacks)', () => {
  assert.ok(buildCspHeader('n', true).includes("'unsafe-eval'"));
  assert.equal(buildCspHeader('n', false).includes("'unsafe-eval'"), false);
});

test('style-src keeps unsafe-inline (React/framer-motion inline styles need it)', () => {
  assert.ok(buildCspHeader('n').includes("style-src 'self' 'unsafe-inline'"));
});

test('the header locks down the rest: no objects, no framing, self-only forms', () => {
  const csp = buildCspHeader('n');
  assert.ok(csp.includes("default-src 'self'"), csp);
  assert.ok(csp.includes("img-src 'self' data: https:"), csp);
  assert.ok(csp.includes("font-src 'self' data:"), csp);
  assert.ok(csp.includes("connect-src 'self'"), csp);
  assert.ok(csp.includes("object-src 'none'"), csp);
  assert.ok(csp.includes("base-uri 'self'"), csp);
  assert.ok(csp.includes("form-action 'self'"), csp);
  assert.ok(csp.includes("frame-ancestors 'none'"), csp);
  assert.ok(csp.includes('upgrade-insecure-requests'), csp);
});

test('generateNonce is unpredictable and unique per call', () => {
  const a = generateNonce();
  const b = generateNonce();
  assert.ok(a.length > 10);
  assert.notEqual(a, b);
  assert.equal(buildCspHeader(a).includes(`'nonce-${a}'`), true);
});

test('proxy: a public page gets a CSP header with a fresh nonce per request', () => {
  const first = proxy(new NextRequest('http://localhost/auth/login'));
  const second = proxy(new NextRequest('http://localhost/auth/login'));
  const n1 = nonceOf(first.headers.get('Content-Security-Policy'));
  const n2 = nonceOf(second.headers.get('Content-Security-Policy'));
  assert.ok(n1, 'first response has a nonce');
  assert.ok(n2, 'second response has a nonce');
  assert.notEqual(n1, n2, 'nonces differ per request');
  assert.equal(first.status, 200);
});

test('proxy: the portal gate still works — no cookie redirects, cookie passes with CSP', () => {
  const anon = proxy(new NextRequest('http://localhost/student/dashboard'));
  assert.equal(anon.status, 307);
  assert.equal(anon.headers.get('location'), 'http://localhost/auth/login');
  assert.ok(nonceOf(anon.headers.get('Content-Security-Policy')), 'redirect also carries CSP');

  const authed = proxy(
    new NextRequest('http://localhost/student/dashboard', {
      headers: { cookie: 'cb_session=opaque-token' },
    }),
  );
  assert.equal(authed.status, 200);
  assert.ok(nonceOf(authed.headers.get('Content-Security-Policy')), 'authed response carries CSP');
});
