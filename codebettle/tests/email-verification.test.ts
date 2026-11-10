import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { registerUser } from '../lib/services/auth-service';
import {
  hashVerificationToken,
  requestEmailVerification,
  verifyEmail,
} from '../lib/services/email-verification-service';
import { findEmailVerificationByTokenHash } from '../lib/db/email-verifications';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import type { EmailTransport } from '../lib/email/resend';
import { POST as authPost } from '../app/api/auth/route';

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const BASE_URL = 'https://codebettle-web.vercel.app';
const ORIGINAL_KEY = process.env.RESEND_API_KEY;

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  delete process.env.RESEND_API_KEY;
});

test.afterEach(() => {
  __resetDbClient();
  if (ORIGINAL_KEY === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = ORIGINAL_KEY;
});

async function makeUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `verify-${tag}-${suffix()}@example.com`;
  const created = await registerUser({ name: 'Verify User', email, password: 'TestPass123' });
  assert.ok('user' in created);
  return { id: created.user.id, email };
}

/** Request a verification and capture the token from the email HTML. */
async function requestWithCapture(
  userId: string,
  email: string,
  opts: { now?: number } = {},
): Promise<{ token: string; html: string }> {
  let html = '';
  const transport: EmailTransport = async (input) => {
    html = input.html;
    return { id: 'msg_1' };
  };
  process.env.RESEND_API_KEY = 're_test_key';
  const result = await requestEmailVerification(userId, email, 'Verify User', BASE_URL, {
    ...opts,
    transport,
  });
  assert.equal(result.sent, true, 'expected the verification email to send');
  const match = html.match(/\/auth\/verify-email\?token=([0-9a-f]{64})/);
  assert.ok(match, 'expected the email to carry a 64-hex verification token');
  return { token: match[1], html };
}

function userRow(userId: string): Record<string, unknown> {
  const row = fake.tables['User']?.get(userId);
  assert.ok(row, 'expected the user row to exist in the fake db');
  return row as Record<string, unknown>;
}

test('request -> verify round-trips; the token is single-use and hashed at rest', async () => {
  const { id, email } = await makeUser('roundtrip');
  const { token } = await requestWithCapture(id, email);

  // Only the hash is stored, never the raw token.
  const stored = await findEmailVerificationByTokenHash(hashVerificationToken(token));
  assert.ok(stored);
  assert.notEqual((stored as unknown as { token?: string }).token, token);
  assert.equal(userRow(id).emailVerifiedAt, null, 'not verified before clicking');

  const verified = await verifyEmail(token);
  assert.ok('success' in verified);
  assert.ok(userRow(id).emailVerifiedAt instanceof Date, 'emailVerifiedAt is set on click');

  // The same token cannot be used twice.
  const reuse = await verifyEmail(token);
  assert.ok('error' in reuse);
});

test('requesting a new verification invalidates the earlier token', async () => {
  const { id, email } = await makeUser('reissue');
  const first = await requestWithCapture(id, email);
  await requestWithCapture(id, email);
  assert.ok('error' in (await verifyEmail(first.token)), 'old token is dead');
});

test('unknown and expired tokens are rejected generically', async () => {
  const { id, email } = await makeUser('expired');
  assert.ok('error' in (await verifyEmail('0'.repeat(64))));

  // Token created 25 hours ago is already past the 24-hour TTL.
  const { token } = await requestWithCapture(id, email, {
    now: Date.now() - 25 * 60 * 60 * 1000,
  });
  assert.ok('error' in (await verifyEmail(token)));
  assert.equal(userRow(id).emailVerifiedAt, null, 'expired link verifies nobody');
});

test('without a Resend key the token is still created but nothing is sent', async () => {
  const { id, email } = await makeUser('nokey');
  const result = await requestEmailVerification(id, email, 'Verify User', BASE_URL);
  assert.deepEqual(result, { sent: false });
  const rows = [...(fake.tables['EmailVerification']?.values() ?? [])] as Record<
    string,
    unknown
  >[];
  assert.equal(rows.length, 1, 'token is stored even when email is down');
  assert.equal(rows[0].userId, id);
});

test('register API: signup succeeds without email and reports verificationEmailSent=false', async () => {
  const email = `route-${suffix()}@example.com`;
  const request = new NextRequest('http://localhost:3000/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Route User',
      email,
      password: 'TestPass123',
      confirmPassword: 'TestPass123',
    }),
  });
  const response = await authPost(request);
  assert.equal(response.status, 201);
  const data = (await response.json()) as {
    success?: boolean;
    verificationEmailSent?: boolean;
    user?: { email?: string };
  };
  assert.equal(data.success, true);
  assert.equal(data.verificationEmailSent, false, 'no Resend key -> flag is false');
  assert.equal(data.user?.email, email);
  // The token was still created for the new account.
  const rows = [...(fake.tables['EmailVerification']?.values() ?? [])] as Record<
    string,
    unknown
  >[];
  assert.equal(rows.length, 1);
});
