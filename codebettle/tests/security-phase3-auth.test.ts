import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { DUMMY_HASH, verifyPassword } from '../lib/security';
import { login, registerUser, changePassword } from '../lib/services/auth-service';
import {
  confirmEmailChange,
  getEmailVerificationStatus,
  isUserEmailVerified,
  requestEmailChange,
} from '../lib/services/email-verification-service';
import { markUserEmailVerified } from '../lib/db/email-verifications';
import {
  createManagedUser,
  deleteManagedUser,
  setUserStatus,
  updateManagedUser,
} from '../lib/admin-users';
import { getUserByEmail, getUserById } from '../lib/db/users';
import {
  SESSION_IDLE_TIMEOUT_MS,
  createSessionRecord,
  revokeOtherSessionsForUser,
  validateSessionToken,
} from '../lib/db/sessions';
import { mintViewAsToken, resolveViewAsSecret, verifyViewAsToken } from '../lib/view-as';
import {
  getSiteSettings,
  isEmailVerificationRequired,
  updateSiteSettings,
} from '../lib/services/settings-service';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import type { EmailTransport } from '../lib/email/resend';
import { POST as authPost } from '../app/api/auth/route';
import { GET as setupGet } from '../app/api/auth/setup/route';

const DAY = 24 * 60 * 60 * 1000;
const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const testEmail = (tag: string) => `sec3-${tag}-${suffix()}@example.com`;
const BASE_URL = 'https://codebettle-web.vercel.app';

let fake: FakeDb;
let ipCounter = 100;

function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

async function postAuth(body: Record<string, unknown>, ip = nextIp()): Promise<{ status: number; data: Record<string, unknown> }> {
  const request = new NextRequest('http://localhost:3000/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
  const response = await authPost(request);
  const data = (await response.json()) as Record<string, unknown>;
  return { status: response.status, data };
}

async function makeStudent(tag: string): Promise<{ id: string; email: string }> {
  const email = testEmail(tag);
  const created = await registerUser({ name: 'Sec3 User', email, password: 'TestPass123' });
  assert.ok('user' in created, `expected user, got ${JSON.stringify(created)}`);
  return { id: created.user.id, email };
}

/** Seed an admin-capability user. `official` seeds one of the two official emails. */
function seedAdmin(id: string, email: string, opts: { isAdmin?: boolean; role?: 'admin' | 'instructor' | 'student' } = {}): void {
  fake.seed('User', [
    {
      id,
      name: `Admin ${id}`,
      email,
      passwordHash: '$2b$12$dummyhashdummyhashdummyhashdummyhashdummyhashdummyha',
      role: opts.role ?? 'admin',
      isAdmin: opts.isAdmin ?? true,
      status: 'active',
      joinedAt: new Date('2024-01-01'),
    },
  ]);
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  delete process.env.RESEND_API_KEY;
});

test.afterEach(() => {
  __resetDbClient();
});

// ---------------------------------------------------------------------------
// HIGH-A1 — DUMMY_HASH is a real bcrypt hash (cost 12), not a 62-char fake
// ---------------------------------------------------------------------------

test('HIGH-A1: DUMMY_HASH is a valid 60-char bcrypt hash; wrong passwords take real bcrypt time, never match', async () => {
  assert.equal(DUMMY_HASH.length, 60, 'a valid bcrypt hash is 60 chars');
  assert.match(DUMMY_HASH, /^\$2[aby]\$12\$/);
  assert.equal(await verifyPassword('anything-at-all', DUMMY_HASH), false);
  // bcryptjs itself accepts it (the old 62-char value threw immediately).
  assert.equal(bcrypt.compareSync('wrongpassword', DUMMY_HASH), false);
  // Unknown-email login still fails generically.
  assert.equal(await login('nobody-here@example.com', 'Whatever123'), null);
});

// ---------------------------------------------------------------------------
// MEDIUM-A1 — duplicate registration is indistinguishable from success
// ---------------------------------------------------------------------------

test('MEDIUM-A1: duplicate registration returns { duplicate: true }, creates no second account', async () => {
  const email = testEmail('dupe');
  assert.ok('user' in (await registerUser({ name: 'A', email, password: 'TestPass123' })));
  const dupe = await registerUser({ name: 'B', email, password: 'TestPass123' });
  assert.ok('duplicate' in dupe, `expected duplicate marker, got ${JSON.stringify(dupe)}`);
  assert.ok(!('error' in dupe), 'no "already exists" error may leak');
  const stored = await getUserByEmail(email);
  assert.ok(stored);
  assert.equal(stored.name, 'A', 'the original account is untouched');
});

test('MEDIUM-A1 (route): duplicate register returns the same generic 201 as a fresh signup', async () => {
  const email = testEmail('route-dupe');
  const ip = nextIp();
  const first = await postAuth(
    { action: 'register', name: 'A', email, password: 'TestPass123', confirmPassword: 'TestPass123' },
    ip,
  );
  assert.equal(first.status, 201);
  assert.equal(first.data.success, true);
  assert.ok(first.data.user, 'fresh signup returns the user');

  // Same IP on purpose: the second call must still be a 201, not a 400.
  const second = await postAuth(
    { action: 'register', name: 'B', email, password: 'TestPass123', confirmPassword: 'TestPass123' },
    ip,
  );
  assert.equal(second.status, 201);
  assert.equal(second.data.success, true);
  assert.equal(second.data.user, undefined, 'no session/user is minted for the existing account');
  assert.ok(!JSON.stringify(second.data).includes('already exists'));
  const stored = await getUserByEmail(email);
  assert.equal(stored?.name, 'A');
});

// ---------------------------------------------------------------------------
// HIGH-A2 — register rate limit (route-level; change-password is
// per-user in the route and needs a live session to exercise — see report)
// ---------------------------------------------------------------------------

test('HIGH-A2 (route): the 6th registration from one IP in 15 minutes is 429', async () => {
  const ip = nextIp();
  for (let i = 0; i < 5; i += 1) {
    const res = await postAuth(
      { action: 'register', name: 'R', email: testEmail(`rl${i}`), password: 'TestPass123' },
      ip,
    );
    assert.equal(res.status, 201, `attempt ${i + 1} should pass`);
  }
  const blocked = await postAuth(
    { action: 'register', name: 'R', email: testEmail('rl6'), password: 'TestPass123' },
    ip,
  );
  assert.equal(blocked.status, 429);
});

// ---------------------------------------------------------------------------
// MEDIUM-A2 — email-verification enforcement, gated behind the setting
// ---------------------------------------------------------------------------

test('MEDIUM-A2: enforcement is OFF by default; enabling it blocks unverified login with a 403 + resend path', async () => {
  assert.equal((await getSiteSettings()).requireEmailVerification, false);
  assert.equal(await isEmailVerificationRequired(), false);

  const { id, email } = await makeStudent('unverified');
  assert.equal(await isUserEmailVerified(id), false);
  assert.equal(await getEmailVerificationStatus(email), 'unverified');
  assert.equal(await getEmailVerificationStatus('nobody@example.com'), 'unknown');

  // OFF: unverified login works exactly as before.
  assert.ok(await login(email, 'TestPass123'));

  // ON: the same credentials now fail at the service layer.
  await updateSiteSettings({ requireEmailVerification: true });
  assert.equal(await isEmailVerificationRequired(), true);
  assert.equal(await login(email, 'TestPass123'), null);
  assert.equal(await login(email, 'WrongPass123'), null);

  // ON, route-level: distinct 403 "verify your email" response…
  const blocked = await postAuth({ action: 'login', email, password: 'TestPass123' });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.emailNotVerified, true);
  assert.match(String(blocked.data.error), /verify your email/i);

  // …while an unknown email still gets the generic 401 (no oracle).
  const unknown = await postAuth({ action: 'login', email: 'nobody@example.com', password: 'TestPass123' });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.data.emailNotVerified, undefined);

  // Resend path: generic success for unknown emails, real link for the unverified one.
  const resendUnknown = await postAuth({ action: 'resend-verification', email: 'nobody@example.com' });
  assert.equal(resendUnknown.status, 200);
  assert.equal(resendUnknown.data.success, true);
  const resend = await postAuth({ action: 'resend-verification', email });
  assert.equal(resend.status, 200);

  // Once verified, login works again with enforcement ON.
  assert.ok(await markUserEmailVerified(id));
  assert.equal(await isUserEmailVerified(id), true);
  assert.ok(await login(email, 'TestPass123'));
  const ok = await postAuth({ action: 'login', email, password: 'TestPass123' });
  assert.equal(ok.status, 200);
});

test('MEDIUM-A2: with enforcement ON, a fresh signup gets no session until verified', async () => {
  await updateSiteSettings({ requireEmailVerification: true });
  const email = testEmail('fresh-unverified');
  const res = await postAuth(
    { action: 'register', name: 'Fresh', email, password: 'TestPass123', confirmPassword: 'TestPass123' },
  );
  assert.equal(res.status, 201);
  assert.equal(res.data.user, undefined, 'no auto-login while unverified');
  assert.match(String(res.data.message), /verify your email/i);
});

// ---------------------------------------------------------------------------
// MEDIUM-A3 — idle timeout, absolute lifetime, revoke-other-sessions
// ---------------------------------------------------------------------------

test('MEDIUM-A3: a session idle for >72h is dead; 2 idle days still validate; absolute lifetime stays 7 days', async () => {
  const now = Date.now();
  const { token } = await createSessionRecord('user-1', { now });
  assert.ok(await validateSessionToken(token, now + 2 * DAY), '2 idle days still valid');

  // A session never touched since creation is idle-timed-out after 72h.
  const { token: idle } = await createSessionRecord('user-1', { now });
  assert.equal(await validateSessionToken(idle, now + 73 * 60 * 60 * 1000), null, 'idle >72h is dead');

  // Active use keeps a session alive inside its 7-day absolute life:
  // validating every 2 days refreshes lastSeenAt, so no 72h idle gap
  // ever opens — until the absolute expiry at creation + 7 days.
  const { token: fresh } = await createSessionRecord('user-1', { now });
  assert.ok(await validateSessionToken(fresh, now + 2 * DAY));
  assert.ok(await validateSessionToken(fresh, now + 4 * DAY));
  assert.ok(await validateSessionToken(fresh, now + 6 * DAY), 'active use keeps it alive inside 7 days');
  assert.equal(await validateSessionToken(fresh, now + 7 * DAY), null, 'absolute 7-day lifetime still enforced');
  assert.equal(SESSION_IDLE_TIMEOUT_MS, 72 * 60 * 60 * 1000);
});

test('MEDIUM-A3: revokeOtherSessionsForUser keeps the current session and revokes the rest', async () => {
  const a = await createSessionRecord('user-1');
  const b = await createSessionRecord('user-1');
  const other = await createSessionRecord('user-2');
  assert.equal(await revokeOtherSessionsForUser('user-1', a.token), 1);
  assert.ok(await validateSessionToken(a.token), 'the kept session survives');
  assert.equal(await validateSessionToken(b.token), null, 'the other session is revoked');
  assert.ok(await validateSessionToken(other.token), 'another user is untouched');
  assert.equal(await revokeOtherSessionsForUser('user-1', a.token), 0, 'nothing left to revoke');
  assert.equal(await revokeOtherSessionsForUser('user-2'), 1, 'no keepToken revokes everything');
  assert.equal(await validateSessionToken(other.token), null);
});

// ---------------------------------------------------------------------------
// LOW-A1 — new password must differ from the current one
// ---------------------------------------------------------------------------

test('LOW-A1: changePassword refuses the current password as the new one', async () => {
  const { id, email } = await makeStudent('pwchange');
  const same = await changePassword(id, 'TestPass123', 'TestPass123');
  assert.ok('error' in same);
  assert.match(same.error, /different from the current password/);
  const ok = await changePassword(id, 'TestPass123', 'BrandNewPass456');
  assert.ok('token' in ok, `expected success, got ${JSON.stringify(ok)}`);
  assert.ok(await login(email, 'BrandNewPass456'));
  assert.equal(await login(email, 'TestPass123'), null);
});

// ---------------------------------------------------------------------------
// LOW-A2 removed (16 Nov 2026, Eman) — view-as tokens carry no expiry
// ---------------------------------------------------------------------------

test('LOW-A2 removed: a view-as token carries no expiry and verifies; a pre-removal-format token is rejected', () => {
  const secret = resolveViewAsSecret();
  const { token } = mintViewAsToken('admin-1', 'teacher-1', 'teacher', secret);
  assert.ok(verifyViewAsToken(token, secret));

  // Pre-removal shape: payload with teacherId + expiry, no kind
  // (valid HMAC) — rejected: the shape check requires targetUserId
  // + kind.
  const encoded = Buffer.from(JSON.stringify({ adminId: 'admin-1', teacherId: 'teacher-1', expiresAt: 1_000_000 }), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('hex');
  assert.equal(verifyViewAsToken(`${encoded}.${signature}`, secret), null);
});

// ---------------------------------------------------------------------------
// LOW-A3 — setup status no longer discloses per-admin claimed flags
// ---------------------------------------------------------------------------

test('LOW-A3: GET /api/auth/setup returns only { complete }, never the per-admin claimed flags', async () => {
  const response = await setupGet();
  assert.equal(response.status, 200);
  const data = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(data).sort(), ['complete']);
  assert.equal(data.complete, false);
  assert.equal('admins' in data, false);
});

// ---------------------------------------------------------------------------
// LOW-B3 — user-management services re-check admin capability
// ---------------------------------------------------------------------------

test('LOW-B3: a non-admin actor cannot call user-management services directly', async () => {
  const { id: studentId, email } = await makeStudent('nonadmin-actor');
  const create = await createManagedUser(studentId, { name: 'X', email: testEmail('x'), password: 'TestPass123' });
  assert.ok('error' in create);
  assert.match(create.error, /Admin access required/);
  const update = await updateManagedUser(studentId, studentId, { name: 'Renamed' });
  assert.ok('error' in update);
  assert.equal(update.status, 403);
  const suspend = await setUserStatus(studentId, studentId, 'suspended');
  assert.ok('error' in suspend);
  const del = await deleteManagedUser(studentId, studentId);
  assert.ok('error' in del);
  // The student is untouched.
  assert.equal((await getUserById(studentId))?.name, 'Sec3 User');
  assert.ok(await login(email, 'TestPass123'));
});

test('LOW-B3: an unknown actor id cannot call user-management services either', async () => {
  const { id, email } = await makeStudent('ghost-actor');
  const res = await setUserStatus('no-such-actor', id, 'suspended');
  assert.ok('error' in res);
  // The user is untouched: still present and still able to sign in.
  assert.ok(await getUserById(id));
  assert.ok(await login(email, 'TestPass123'));
});

// ---------------------------------------------------------------------------
// CRITICAL-A2 — email-change takeover guards + verification-gated change
// ---------------------------------------------------------------------------

test('CRITICAL-A2: a restricted admin cannot change an email TO or FROM an official-admin email', async () => {
  // A restricted admin: admin capability, but NOT a super-admin email.
  seedAdmin('restricted-1', 'restricted-admin@example.com');
  // Eman's claimed official account (the takeover target).
  seedAdmin('official-1', 'mhateemjutt1412@gmail.com');
  const { id: studentId } = await makeStudent('takeover-target');

  // Chain A: restricted admin gives THEMSELVES Ahmad's email.
  const selfSwap = await updateManagedUser('restricted-1', 'restricted-1', { email: 'ahmad.hassan.hnd@gmail.com' });
  assert.ok('error' in selfSwap, `expected refusal, got ${JSON.stringify(selfSwap)}`);
  assert.equal(selfSwap.status, 403);
  assert.equal((await getUserById('restricted-1'))?.email, 'restricted-admin@example.com');

  // Chain A variant: restricted admin moves a STUDENT onto Ahmad's email.
  const studentSwap = await updateManagedUser('restricted-1', studentId, { email: 'ahmad.hassan.hnd@gmail.com' });
  assert.ok('error' in studentSwap);
  assert.equal(studentSwap.status, 403);

  // Chain B setup: restricted admin moves Eman's email to an attacker address.
  const officialSwap = await updateManagedUser('restricted-1', 'official-1', { email: 'attacker@evil.example' });
  assert.ok('error' in officialSwap);
  assert.equal(officialSwap.status, 403);
  assert.equal((await getUserById('official-1'))?.email, 'mhateemjutt1412@gmail.com');

  // The super-admin exception (CRITICAL-A2 (a)): Eman himself MAY
  // initiate a TO-official change — it still goes through the
  // verification flow and never applies directly.
  seedAdmin('super-1', 'mhateemjutt1412@gmail.com');
  const superSwap = await updateManagedUser('super-1', studentId, { email: 'ahmad.hassan.hnd@gmail.com' });
  assert.ok('user' in superSwap, `expected pending, got ${JSON.stringify(superSwap)}`);
  assert.equal(superSwap.emailChangePending, true);
  assert.equal(superSwap.user.email, (await getUserById(studentId))?.email);
});

test('CRITICAL-A2: only a super-admin-authorized token can confirm a change TO an official email', async () => {
  const { id: userId } = await makeStudent('official-confirm');
  let html = '';
  const transport: EmailTransport = async (input) => {
    html = input.html;
    return { id: 'msg_1' };
  };
  process.env.RESEND_API_KEY = 'test-key';

  // Ordinary token (no super-admin authorization): official address refused.
  await requestEmailChange(userId, 'ahmad.hassan.hnd@gmail.com', BASE_URL, { transport });
  let match = html.match(/\/auth\/confirm-email-change\?token=([0-9a-f]{64})&email=([^"&\s]+)/);
  assert.ok(match);
  assert.ok('error' in (await confirmEmailChange(match[1], 'ahmad.hassan.hnd@gmail.com')));

  // Super-admin-authorized token: the same confirmation succeeds.
  await requestEmailChange(userId, 'ahmad.hassan.hnd@gmail.com', BASE_URL, {
    transport,
    allowOfficialAdminEmail: true,
  });
  match = html.match(/\/auth\/confirm-email-change\?token=([0-9a-f]{64})&email=([^"&\s]+)/);
  assert.ok(match);
  const confirmed = await confirmEmailChange(match[1], 'ahmad.hassan.hnd@gmail.com');
  assert.ok('success' in confirmed, `expected success, got ${JSON.stringify(confirmed)}`);
  assert.equal((await getUserById(userId))?.email, 'ahmad.hassan.hnd@gmail.com');
});

test('CRITICAL-A2: createManagedUser never creates an account with an official-admin email', async () => {
  seedAdmin('admin-1', 'admin@example.com');
  const created = await createManagedUser('admin-1', {
    name: 'Fake Ahmad',
    email: 'ahmad.hassan.hnd@gmail.com',
    password: 'TestPass123',
  });
  assert.ok('error' in created);
  assert.match(created.error, /first-run setup/);
  assert.equal(await getUserByEmail('ahmad.hassan.hnd@gmail.com'), null);
});

test('CRITICAL-A2: an email change never applies directly — it stays pending until the new address confirms', async () => {
  // Super-admin actor (Eman) changing a student's email.
  seedAdmin('super-1', 'mhateemjutt1412@gmail.com');
  const { id: studentId, email: oldEmail } = await makeStudent('pending-change');
  const newEmail = testEmail('pending-new');

  const result = await updateManagedUser('super-1', studentId, { email: newEmail });
  assert.ok('user' in result, `expected success, got ${JSON.stringify(result)}`);
  assert.equal(result.user.email, oldEmail, 'the email is UNCHANGED until confirmation');
  assert.equal(result.emailChangePending, true);
  assert.equal(result.pendingEmail, newEmail);

  // A token was stored (hashed, bound to the new address) for the user.
  const rows = [...(fake.tables['EmailVerification']?.values() ?? [])] as Record<string, unknown>[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, studentId);
});

test('CRITICAL-A2: self-email change also goes through the verification flow, never direct', async () => {
  seedAdmin('super-1', 'mhateemjutt1412@gmail.com');
  const result = await updateManagedUser('super-1', 'super-1', { email: testEmail('self-new') });
  assert.ok('user' in result, `expected success, got ${JSON.stringify(result)}`);
  assert.equal(result.user.email, 'mhateemjutt1412@gmail.com', 'own email unchanged until confirmation');
  assert.equal(result.emailChangePending, true);
});

test('CRITICAL-A2: confirmEmailChange round-trips — applies, verifies, revokes all sessions, single-use, address-bound', async () => {
  const { id: userId, email: oldEmail } = await makeStudent('confirm-roundtrip');
  const newEmail = testEmail('confirm-new');
  const { token } = await createSessionRecord(userId);
  assert.ok(await validateSessionToken(token), 'session alive before the change');

  // Capture the confirmation link from the email.
  let html = '';
  const transport: EmailTransport = async (input) => {
    html = input.html;
    return { id: 'msg_1' };
  };
  process.env.RESEND_API_KEY = 'test-key';
  const requested = await requestEmailChange(userId, newEmail, BASE_URL, { transport });
  assert.equal(requested.sent, true);
  const match = html.match(/\/auth\/confirm-email-change\?token=([0-9a-f]{64})&email=([^"&\s]+)/);
  assert.ok(match, `expected a confirmation link in the email, got: ${html}`);
  const rawToken = match[1];

  // The token is bound to the new address: confirming a DIFFERENT address fails.
  const wrongAddress = await confirmEmailChange(rawToken, testEmail('other'));
  assert.ok('error' in wrongAddress);
  // …and an official-admin address can never be confirmed this way.
  const official = await confirmEmailChange(rawToken, 'ahmad.hassan.hnd@gmail.com');
  assert.ok('error' in official);
  // A garbage token fails generically.
  assert.ok('error' in (await confirmEmailChange('0'.repeat(64), newEmail)));

  // The real confirmation applies the change…
  const confirmed = await confirmEmailChange(rawToken, newEmail);
  assert.ok('success' in confirmed, `expected success, got ${JSON.stringify(confirmed)}`);
  assert.equal(confirmed.email, newEmail);
  assert.equal((await getUserById(userId))?.email, newEmail);
  assert.equal(await isUserEmailVerified(userId), true, 'the new address is proven verified');
  assert.equal(await validateSessionToken(token), null, 'ALL sessions revoked on email change');
  assert.ok(await login(newEmail, 'TestPass123'), 'sign-in works with the new address');
  assert.equal(await login(oldEmail, 'TestPass123'), null, 'the old address no longer signs in');

  // …and the token is single-use.
  assert.ok('error' in (await confirmEmailChange(rawToken, newEmail)));
});

test('CRITICAL-A2: an expired email-change token cannot confirm', async () => {
  const { id: userId } = await makeStudent('confirm-expired');
  const newEmail = testEmail('confirm-expired-new');
  let html = '';
  const transport: EmailTransport = async (input) => {
    html = input.html;
    return { id: 'msg_1' };
  };
  process.env.RESEND_API_KEY = 'test-key';
  await requestEmailChange(userId, newEmail, BASE_URL, { transport, now: Date.now() - 25 * 60 * 60 * 1000 });
  const match = html.match(/\/auth\/confirm-email-change\?token=([0-9a-f]{64})&email=([^"&\s]+)/);
  assert.ok(match);
  assert.ok('error' in (await confirmEmailChange(match[1], newEmail)));
  assert.notEqual((await getUserById(userId))?.email, newEmail);
});
