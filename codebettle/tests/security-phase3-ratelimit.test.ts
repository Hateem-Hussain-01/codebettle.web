import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  __clearRateLimits,
  checkRateLimit,
  checkRateLimitAsync,
  getClientIp,
  getRateLimitBackend,
} from '../lib/rate-limit';
import { config as proxyConfig, proxy } from '../proxy';
import {
  DELETE as catchAllDelete,
  GET as catchAllGet,
  OPTIONS as catchAllOptions,
  PATCH as catchAllPatch,
  POST as catchAllPost,
  PUT as catchAllPut,
} from '../app/api/[...path]/route';

function headersOf(headers: Record<string, string>) {
  return {
    headers: {
      get(name: string): string | null {
        return headers[name.toLowerCase()] ?? null;
      },
    },
  };
}

const UPSTASH_URL = 'https://example.upstash.io';
const UPSTASH_TOKEN = 'test-token';

let savedEnvUrl: string | undefined;
let savedEnvToken: string | undefined;
let savedFetch: typeof fetch | undefined;
let savedWarn: typeof console.warn;

test.beforeEach(() => {
  __clearRateLimits();
  savedEnvUrl = process.env.UPSTASH_REDIS_REST_URL;
  savedEnvToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  savedFetch = globalThis.fetch;
  savedWarn = console.warn;
  console.warn = () => {};
});

test.afterEach(() => {
  if (savedEnvUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = savedEnvUrl;
  if (savedEnvToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = savedEnvToken;
  globalThis.fetch = savedFetch as typeof fetch;
  console.warn = savedWarn;
  __clearRateLimits();
});

// --- HIGH-A3 / U-2: trusted client IP -------------------------------------

test('getClientIp: x-real-ip wins over a spoofed first X-Forwarded-For entry', () => {
  const ip = getClientIp(
    headersOf({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '1.2.3.4, 203.0.113.9' })
  );
  assert.equal(ip, '203.0.113.9');
});

test('getClientIp: without x-real-ip it falls back to the LAST X-Forwarded-For hop, never the first', () => {
  const ip = getClientIp(headersOf({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 203.0.113.9' }));
  assert.equal(ip, '203.0.113.9');
});

test('getClientIp: a single X-Forwarded-For entry is used as-is', () => {
  assert.equal(getClientIp(headersOf({ 'x-forwarded-for': '203.0.113.9' })), '203.0.113.9');
});

test('getClientIp: no IP headers at all returns unknown', () => {
  assert.equal(getClientIp(headersOf({})), 'unknown');
});

test('getClientIp: surrounding whitespace is trimmed', () => {
  assert.equal(
    getClientIp(headersOf({ 'x-forwarded-for': '  1.2.3.4 , 203.0.113.9  ' })),
    '203.0.113.9'
  );
});

// --- HIGH-A3 / U-1: shared store vs in-memory fallback ---------------------

test('checkRateLimitAsync: without Upstash vars it falls back to the in-memory limiter', async () => {
  assert.equal(getRateLimitBackend(), 'memory');
  const now = Date.now();
  for (let i = 0; i < 5; i += 1) {
    const r = await checkRateLimitAsync('contact:9.9.9.9', 5, 15 * 60 * 1000, now);
    assert.equal(r.allowed, true);
  }
  const blocked = await checkRateLimitAsync('contact:9.9.9.9', 5, 15 * 60 * 1000, now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
});

test('checkRateLimitAsync: with Upstash vars it counts in Redis (mocked fetch)', async () => {
  process.env.UPSTASH_REDIS_REST_URL = UPSTASH_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = UPSTASH_TOKEN;
  assert.equal(getRateLimitBackend(), 'upstash');

  const seen: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url, init: init ?? {} });
    return new Response(
      JSON.stringify({
        result: [
          { result: 1, error: null },
          { result: 1, error: null },
          { result: 899000, error: null },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  const now = Date.now();
  const r = await checkRateLimitAsync('login:203.0.113.9:a@x.com', 5, 15 * 60 * 1000, now);
  assert.equal(r.allowed, true);
  assert.equal(r.remaining, 4);
  assert.equal(r.resetAt, now + 899000);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, `${UPSTASH_URL}/pipeline`);
  assert.equal(seen[0].init.method, 'POST');
  const headers = new Headers(seen[0].init.headers);
  assert.equal(headers.get('authorization'), `Bearer ${UPSTASH_TOKEN}`);
  const body = JSON.parse(String(seen[0].init.body));
  assert.deepEqual(body[0], ['INCR', 'cb:ratelimit:login:203.0.113.9:a@x.com']);
  assert.deepEqual(body[1], ['PEXPIRE', 'cb:ratelimit:login:203.0.113.9:a@x.com', 900000, 'NX']);
  assert.deepEqual(body[2], ['PTTL', 'cb:ratelimit:login:203.0.113.9:a@x.com']);
});

test('checkRateLimitAsync: a Redis count over the limit blocks the request', async () => {
  process.env.UPSTASH_REDIS_REST_URL = UPSTASH_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = UPSTASH_TOKEN;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        result: [
          { result: 6, error: null },
          { result: 0, error: null },
          { result: 1000, error: null },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )) as typeof fetch;

  const now = Date.now();
  const r = await checkRateLimitAsync('login:203.0.113.9:a@x.com', 5, 15 * 60 * 1000, now);
  assert.equal(r.allowed, false);
  assert.equal(r.remaining, 0);
  assert.equal(r.resetAt, now + 1000);
});

test('checkRateLimitAsync: a Redis failure falls back to the in-memory limiter', async () => {
  process.env.UPSTASH_REDIS_REST_URL = UPSTASH_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = UPSTASH_TOKEN;
  globalThis.fetch = (async () => {
    throw new Error('redis down');
  }) as typeof fetch;

  const now = Date.now();
  const first = await checkRateLimitAsync('contact:9.9.9.9', 1, 60_000, now);
  assert.equal(first.allowed, true);
  // The in-memory window now holds the count, so the next call blocks
  // even though Redis is still down.
  const second = await checkRateLimitAsync('contact:9.9.9.9', 1, 60_000, now);
  assert.equal(second.allowed, false);
});

test('getRateLimitBackend: memory unless BOTH Upstash vars are set', () => {
  assert.equal(getRateLimitBackend(), 'memory');
  process.env.UPSTASH_REDIS_REST_URL = UPSTASH_URL;
  assert.equal(getRateLimitBackend(), 'memory');
  process.env.UPSTASH_REDIS_REST_TOKEN = UPSTASH_TOKEN;
  assert.equal(getRateLimitBackend(), 'upstash');
});

test('checkRateLimit (sync) is unchanged: same windows as the async fallback', async () => {
  const now = Date.now();
  assert.equal(checkRateLimit('login:1.1.1.1:a@x.com', 1, 60_000, now).allowed, true);
  assert.equal(checkRateLimit('login:1.1.1.1:a@x.com', 1, 60_000, now).allowed, false);
  // The async fallback shares the same in-memory windows.
  const viaAsync = await checkRateLimitAsync('login:1.1.1.1:a@x.com', 1, 60_000, now);
  assert.equal(viaAsync.allowed, false);
});

// --- P-4: unmatched /api/* paths return 404 -------------------------------

test('catch-all API route: every method on an unmatched path returns 404 JSON', async () => {
  for (const handler of [catchAllGet, catchAllPost, catchAllPut, catchAllPatch, catchAllDelete, catchAllOptions]) {
    const res = await handler();
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Not found' });
  }
});

// --- U-8: prefetch must not exempt /api/* mutations from the Origin check --

test('proxy: a prefetch-flagged cross-origin API mutation is rejected', async () => {
  const req = new NextRequest('http://localhost/api/student/wishlist', {
    method: 'POST',
    headers: { origin: 'https://evil.example.com', 'next-router-prefetch': '1' },
  });
  const res = await proxy(req);
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'Cross-origin request rejected' });
});

test('proxy: purpose:prefetch cross-origin API mutation is rejected too', async () => {
  const req = new NextRequest('http://localhost/api/student/wishlist', {
    method: 'POST',
    headers: { origin: 'https://evil.example.com', purpose: 'prefetch' },
  });
  const res = await proxy(req);
  assert.equal(res.status, 403);
});

test('proxy: a same-origin prefetch-flagged API mutation still passes (only the Origin check applies)', async () => {
  const req = new NextRequest('http://localhost/api/student/wishlist', {
    method: 'POST',
    headers: { origin: 'http://localhost', 'next-router-prefetch': '1' },
  });
  const res = await proxy(req);
  assert.notEqual(res.status, 403);
});

test('proxy: header-less API mutations still pass by design (out of scope for U-8)', async () => {
  const req = new NextRequest('http://localhost/api/student/wishlist', {
    method: 'POST',
    headers: { 'next-router-prefetch': '1' },
  });
  const res = await proxy(req);
  assert.notEqual(res.status, 403);
});

test('proxy matcher: the /api/:path* entry has no prefetch exemption', () => {
  const apiEntry = proxyConfig.matcher.find(
    (entry) => typeof entry === 'object' && entry.source === '/api/:path*'
  );
  assert.ok(apiEntry, 'expected a /api/:path* matcher entry');
  assert.ok(typeof apiEntry === 'object' && !('missing' in apiEntry), 'api entry must not skip prefetch requests');
  // The page matcher still skips prefetch requests (by design).
  const pageEntry = proxyConfig.matcher.find(
    (entry) => typeof entry === 'object' && entry.source.startsWith('/((')
  );
  assert.ok(pageEntry && typeof pageEntry === 'object' && 'missing' in pageEntry);
});
