import test from 'node:test';
import assert from 'node:assert/strict';
// FIRST import: sets globalThis.AsyncLocalStorage before any Next
// module loads (see tests/next-request-store.ts) — required for the
// change-password tests, which call getSession() via next/headers.
import { withRequestCookies } from './next-request-store';
import { NextRequest } from 'next/server';
import {
  __clearRateLimits,
  changePasswordRateLimitKey,
  registerRateLimitKey,
  resendVerificationRateLimitKey,
  setupRateLimitKey,
} from '../lib/rate-limit';
import { registerUser } from '../lib/services/auth-service';
import { createSessionRecord } from '../lib/db/sessions';
import { SESSION_COOKIE } from '../lib/auth';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { POST as authPost } from '../app/api/auth/route';
import { POST as resetPost } from '../app/api/auth/reset/route';
import { POST as setupPost } from '../app/api/auth/setup/route';

// ---------------------------------------------------------------------------
// Auth routes on the shared async rate limiter (HIGH-A3 / U-1 / U-2 /
// HIGH-A2 follow-up). Before this change each auth route defined its own
// local clientIp() trusting the FIRST X-Forwarded-For entry and called
// the SYNC in-memory limiter — so a spoofed first entry bought a fresh
// bucket per request and the limits never fired across Vercel instances
// (Phase 4 live: 6 failed logins → all 401, 8 registers → all 201).
//
// These tests are discriminating: every spoofing test FAILS on the old
// code (rotating first-XFF entries each get a fresh bucket, so no 429
// ever fires) and PASSES on the migrated code (getClientIp takes the
// LAST hop, so all six attempts share one bucket). The Upstash tests
// prove the routes actually consult the async store: with Redis
// reporting a count over the limit, the FIRST attempt is 429 — the
// old code would return 401/400 without ever calling fetch.
// ---------------------------------------------------------------------------

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const testEmail = (tag: string) => `rl-${tag}-${suffix()}@example.com`;
const BASE_URL = 'http://localhost:3000';
const LAST_HOP = '203.0.113.9';

let fake: FakeDb;
let ipCounter = 200;
let spoofCounter = 0;

function nextLastHop(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

/**
 * Headers for one attempt of a spoofed burst: the first X-Forwarded-For
 * entry rotates (whatever the attacker sends), the LAST hop is constant
 * (the hop closest to our edge — the one getClientIp trusts). No
 * x-real-ip, so the last-hop rule is what decides the bucket.
 */
function spoofedHeaders(lastHop: string): Record<string, string> {
  spoofCounter += 1;
  return { 'x-forwarded-for': `198.51.100.${spoofCounter}, ${lastHop}` };
}

async function postJson(
  handler: (request: NextRequest) => Promise<Response>,
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const request = new NextRequest(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const response = await handler(request);
  const data = (await response.json()) as Record<string, unknown>;
  return { status: response.status, data };
}

const realFetch = globalThis.fetch;

function mockUpstashFetch(count: number): { calls: { url: string; body: string }[] } {
  const calls: { url: string; body: string }[] = [];
  globalThis.fetch = (async (url: string, init?: { body?: unknown }) => {
    calls.push({ url, body: String(init?.body ?? '') });
    return {
      ok: true,
      json: async () => ({
        result: [{ result: count }, { result: 1 }, { result: 900_000 }],
      }),
    };
  }) as typeof fetch;
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash.example.com';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token-for-tests';
  return { calls };
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  __clearRateLimits();
  delete process.env.RESEND_API_KEY;
  spoofCounter = 0;
});

test.afterEach(() => {
  __resetDbClient();
  __clearRateLimits();
  globalThis.fetch = realFetch;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

// ---------------------------------------------------------------------------
// Key builders — the rate-limit KEYS are unchanged by the migration, so
// windows (and any keys already in Redis) keep working. These pin the
// exact legacy strings.
// ---------------------------------------------------------------------------

test('auth rate-limit keys: new helpers produce the exact legacy key strings', () => {
  assert.equal(registerRateLimitKey('203.0.113.9'), 'register:203.0.113.9');
  assert.equal(changePasswordRateLimitKey('user-1'), 'change-password:user-1');
  assert.equal(
    resendVerificationRateLimitKey('203.0.113.9', 'A@X.com'),
    'resend-verification:203.0.113.9:a@x.com',
  );
  assert.equal(setupRateLimitKey('203.0.113.9'), 'setup:203.0.113.9');
});

// ---------------------------------------------------------------------------
// Spoofing: rotating the FIRST X-Forwarded-For entry must not buy a
// fresh bucket — all six attempts share the last hop's bucket.
// ---------------------------------------------------------------------------

test('login: 6 failed logins with a rotating spoofed first XFF entry (same last hop) → 6th is 429', async () => {
  const lastHop = nextLastHop();
  const email = testEmail('login-spoof');
  for (let i = 0; i < 5; i += 1) {
    const res = await postJson(
      authPost,
      '/api/auth',
      { action: 'login', email, password: 'WrongPass123' },
      spoofedHeaders(lastHop),
    );
    assert.equal(res.status, 401, `attempt ${i + 1} should be a plain 401`);
  }
  const blocked = await postJson(
    authPost,
    '/api/auth',
    { action: 'login', email, password: 'WrongPass123' },
    spoofedHeaders(lastHop),
  );
  assert.equal(blocked.status, 429);
  assert.match(String(blocked.data.error), /Too many login attempts/);
});

test('register: 6 registrations with a rotating spoofed first XFF entry (same last hop) → 6th is 429', async () => {
  const lastHop = nextLastHop();
  for (let i = 0; i < 5; i += 1) {
    const res = await postJson(
      authPost,
      '/api/auth',
      { action: 'register', name: 'R', email: testEmail(`reg${i}`), password: 'TestPass123' },
      spoofedHeaders(lastHop),
    );
    assert.equal(res.status, 201, `attempt ${i + 1} should pass`);
  }
  const blocked = await postJson(
    authPost,
    '/api/auth',
    { action: 'register', name: 'R', email: testEmail('reg6'), password: 'TestPass123' },
    spoofedHeaders(lastHop),
  );
  assert.equal(blocked.status, 429);
  assert.match(String(blocked.data.error), /Too many registration attempts/);
});

test('reset: 6 reset requests with a rotating spoofed first XFF entry (same last hop) → 6th is 429', async () => {
  const lastHop = nextLastHop();
  const email = testEmail('reset-spoof');
  for (let i = 0; i < 5; i += 1) {
    const res = await postJson(
      resetPost,
      '/api/auth/reset',
      { action: 'request', email },
      spoofedHeaders(lastHop),
    );
    assert.equal(res.status, 200, `attempt ${i + 1} should be the generic success`);
  }
  const blocked = await postJson(
    resetPost,
    '/api/auth/reset',
    { action: 'request', email },
    spoofedHeaders(lastHop),
  );
  assert.equal(blocked.status, 429);
  assert.match(String(blocked.data.error), /Too many reset requests/);
});

test('setup: 6 setup claims with a rotating spoofed first XFF entry (same last hop) → 6th is 429', async () => {
  const lastHop = nextLastHop();
  // A non-approved email: the claim itself fails 400 AFTER the limit
  // check, so the first five attempts reach the service and the sixth
  // is stopped by the limiter — without creating any account.
  for (let i = 0; i < 5; i += 1) {
    const res = await postJson(
      setupPost,
      '/api/auth/setup',
      { email: testEmail('setup-spoof'), password: 'TestPass123' },
      spoofedHeaders(lastHop),
    );
    assert.equal(res.status, 400, `attempt ${i + 1} should be the not-approved 400`);
  }
  const blocked = await postJson(
    setupPost,
    '/api/auth/setup',
    { email: testEmail('setup-spoof6'), password: 'TestPass123' },
    spoofedHeaders(lastHop),
  );
  assert.equal(blocked.status, 429);
  assert.match(String(blocked.data.error), /Too many setup attempts/);
});

test('resend-verification: 6 resends with a rotating spoofed first XFF entry (same last hop) → 6th is 429', async () => {
  const lastHop = nextLastHop();
  const email = testEmail('resend-spoof');
  for (let i = 0; i < 5; i += 1) {
    const res = await postJson(
      authPost,
      '/api/auth',
      { action: 'resend-verification', email },
      spoofedHeaders(lastHop),
    );
    assert.equal(res.status, 200, `attempt ${i + 1} should be the generic success`);
  }
  const blocked = await postJson(
    authPost,
    '/api/auth',
    { action: 'resend-verification', email },
    spoofedHeaders(lastHop),
  );
  assert.equal(blocked.status, 429);
  assert.match(String(blocked.data.error), /Too many verification requests/);
});

// ---------------------------------------------------------------------------
// Upstash: with the vars set, the routes consult the async store. A Redis
// count over the limit blocks the FIRST attempt — the old sync code
// would never call fetch and would return 401/400 instead.
// ---------------------------------------------------------------------------

test('login consults Upstash: a Redis count over the limit 429s the first attempt', async () => {
  const { calls } = mockUpstashFetch(6);
  const res = await postJson(authPost, '/api/auth', {
    action: 'login',
    email: testEmail('upstash-login'),
    password: 'WrongPass123',
  });
  assert.equal(res.status, 429);
  assert.equal(calls.length, 1, 'the route must call the Upstash pipeline once');
  assert.match(calls[0].url, /\/pipeline$/);
  assert.match(calls[0].body, /cb:ratelimit:login:/);
});

test('change-password consults Upstash: a Redis count over the limit 429s the first attempt', async () => {
  const created = await registerUser({
    name: 'CP User',
    email: testEmail('upstash-cp'),
    password: 'TestPass123',
  });
  assert.ok('user' in created, `expected user, got ${JSON.stringify(created)}`);
  const { token } = await createSessionRecord(created.user.id);
  const { calls } = mockUpstashFetch(6);
  // change-password reads the session via getSession() (next/headers),
  // which needs a request store — see tests/next-request-store.ts.
  const res = await withRequestCookies(
    `${SESSION_COOKIE}=${token}`,
    () =>
      postJson(
        authPost,
        '/api/auth',
        { action: 'change-password', currentPassword: 'WrongPass123', newPassword: 'NewPass123' },
        { 'x-forwarded-for': LAST_HOP },
      ),
  );
  assert.equal(res.status, 429);
  assert.equal(calls.length, 1, 'the route must call the Upstash pipeline once');
  assert.match(calls[0].body, /cb:ratelimit:change-password:/);
});

test('change-password with Redis under the limit proceeds to the service (400 for a wrong current password)', async () => {
  const created = await registerUser({
    name: 'CP User',
    email: testEmail('upstash-cp-ok'),
    password: 'TestPass123',
  });
  assert.ok('user' in created, `expected user, got ${JSON.stringify(created)}`);
  const { token } = await createSessionRecord(created.user.id);
  mockUpstashFetch(1);
  // See the test above: the route reads the session via next/headers.
  const res = await withRequestCookies(
    `${SESSION_COOKIE}=${token}`,
    () =>
      postJson(
        authPost,
        '/api/auth',
        { action: 'change-password', currentPassword: 'WrongPass123', newPassword: 'NewPass123' },
        { 'x-forwarded-for': LAST_HOP },
      ),
  );
  assert.equal(res.status, 400);
  assert.match(String(res.data.error), /Current password is incorrect/);
});
