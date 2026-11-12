/**
 * Module 18 tests — admin invitations (Phase 2).
 *
 * Covers the behaviours the coordinator asked for:
 * - An invitation is created with a hash-only token (raw token never stored).
 * - Accept sets the invitee's OWN password and applies the stored grants.
 * - Expired tokens are rejected; used tokens cannot be reused.
 * - Case A (existing account) is a 409 pointing at the direct grant,
 *   and that grant preserves the teacher role/flag.
 * - Revoking admin access does not delete the teacher account/data.
 * - Non-full-admins cannot create invitations (service + route).
 * - Resend mints a fresh token and kills the old one; DELETE revokes.
 * - The accept route rejects mismatched / short passwords.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { hashToken, verifyPassword } from '../lib/security';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import {
  acceptInvitation,
  createInvitationForAdmin,
  getInvitationPreview,
  INVITATION_TTL_MS,
  listInvitationsForAdmin,
  resendInvitation,
  revokeInvitation,
} from '../lib/services/invitation-service';
import { revokeAdminAccess, updateAdminAccess } from '../lib/services/admin-access-service';
import { getInvitationById, getInvitationByTokenHash } from '../lib/db/invitations';
import { createInvitation } from '../lib/db/invitations';
import { getUserByEmail, getUserById } from '../lib/db/users';
import { createFakeDb, type FakeDb } from './fake-db';
import type { SessionUser } from '../lib/services/auth-service';

let fake: FakeDb;
const ORIGINAL_KEY = process.env.RESEND_API_KEY;

const FULL: SessionUser = { id: 'admin-full', name: 'Admin', email: 'admin-full@example.com', role: 'admin' };
// Phase 5, Module 23: the access-management routes are gated on the
// official administrators now, not just any full admin.
const OFFICIAL: SessionUser = {
  id: 'official-1',
  name: 'Muhammad Hateem Hussain',
  email: 'mhateemjutt1412@gmail.com',
  role: 'admin',
  isAdmin: true,
};
const RESTRICTED: SessionUser = {
  id: 'restricted-1',
  name: 'Restricted',
  email: 'restricted-1@example.com',
  role: 'student',
  isAdmin: true,
  adminPermissions: { courses: true },
};

function seedUser(id: string, role: string, extra: Record<string, unknown> = {}) {
  fake.seed('User', [
    {
      id,
      name: `User ${id}`,
      email: `${id}@example.com`,
      passwordHash: '$2b$12$dummyhashdummyhashdummyhashdummyhashdummyhashdummyha',
      role,
      status: 'active',
      joinedAt: new Date('2024-01-01'),
      ...extra,
    },
  ]);
}

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function tokenFromUrl(url: string): string {
  const token = new URL(url).searchParams.get('token');
  assert.ok(token, 'invite URL must carry a token');
  return token;
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  delete process.env.RESEND_API_KEY;
  seedUser('admin-full', 'admin');
  seedUser('official-1', 'admin', { email: 'mhateemjutt1412@gmail.com', isAdmin: true });
  seedUser('teacher-1', 'instructor', { isTeacher: true });
  seedUser('student-1', 'student');
  seedUser('restricted-1', 'student', { isAdmin: true, adminPermissions: { courses: true } });
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
  if (ORIGINAL_KEY === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = ORIGINAL_KEY;
});

// ---------------------------------------------------------------------------
// Creation: hash-only token, 7-day expiry, email behaviour
// ---------------------------------------------------------------------------

test('invitation created with hash-only token, 7-day expiry, and no email claim when Resend is unconfigured', async () => {
  const now = Date.now();
  const created = await createInvitationForAdmin(
    'admin-full',
    { firstName: 'Nadia', lastName: 'Khan', email: 'nadia@example.com', contactNumber: '+92 300 0000000' },
    { baseUrl: 'http://localhost:3000', now },
  );
  assert.ok(!('error' in created));
  assert.equal(created.emailSent, false);
  assert.ok(created.inviteUrl.startsWith('http://localhost:3000/auth/accept-invitation?token='));
  assert.equal('tokenHash' in created.invitation, false);
  assert.deepEqual(created.invitation.grants, { isAdmin: true, adminPermissions: null });
  assert.equal(created.invitation.status, 'pending');

  const rawToken = tokenFromUrl(created.inviteUrl);
  assert.equal(rawToken.length, 64);
  const stored = await getInvitationByTokenHash(hashToken(rawToken));
  assert.ok(stored);
  assert.equal(stored.tokenHash, hashToken(rawToken));
  assert.notEqual(stored.tokenHash, rawToken);
  assert.equal(JSON.stringify(stored).includes(rawToken), false);
  assert.equal(new Date(stored.expiresAt).getTime(), now + INVITATION_TTL_MS);
  assert.equal(stored.email, 'nadia@example.com');
  assert.equal(stored.contactNumber, '+92 300 0000000');
});

test('when Resend is configured the activation email is sent (fake transport)', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  let sentTo = '';
  const created = await createInvitationForAdmin(
    'admin-full',
    { firstName: 'Nadia', lastName: 'Khan', email: 'nadia@example.com' },
    {
      baseUrl: 'http://localhost:3000',
      transport: async (input) => {
        sentTo = input.to;
        assert.ok(input.html.includes('/auth/accept-invitation?token='));
        assert.ok(input.subject.toLowerCase().includes('invit'));
        return { id: 'msg-1' };
      },
    },
  );
  assert.ok(!('error' in created));
  assert.equal(created.emailSent, true);
  assert.equal(sentTo, 'nadia@example.com');
});

test('a second pending invitation for the same email is a 409', async () => {
  const first = await createInvitationForAdmin('admin-full', {
    firstName: 'Nadia',
    lastName: 'Khan',
    email: 'nadia@example.com',
  });
  assert.ok(!('error' in first));
  const second = await createInvitationForAdmin('admin-full', {
    firstName: 'Nadia',
    lastName: 'Khan',
    email: 'nadia@example.com',
  });
  assert.ok('error' in second);
  assert.equal(second.status, 409);
});

// ---------------------------------------------------------------------------
// Accept: own password + grants
// ---------------------------------------------------------------------------

test('accept sets the user’s own password and applies grants; a teacher invitee stays a teacher', async () => {
  const created = await createInvitationForAdmin(
    'admin-full',
    {
      firstName: 'Nadia',
      lastName: 'Khan',
      email: 'nadia@example.com',
      isTeacher: true,
      permissions: { courses: true },
    },
    { baseUrl: 'http://localhost:3000' },
  );
  assert.ok(!('error' in created));
  const result = await acceptInvitation(tokenFromUrl(created.inviteUrl), 'my-secret-pass');
  assert.ok(!('error' in result));
  assert.equal(result.user.email, 'nadia@example.com');
  assert.equal(result.user.role, 'instructor');
  assert.equal(result.user.isAdmin, true);
  assert.equal(result.user.isTeacher, true);
  assert.deepEqual(result.user.adminPermissions, { courses: true });

  const stored = await getUserByEmail('nadia@example.com');
  assert.ok(stored);
  assert.equal(await verifyPassword('my-secret-pass', stored.passwordHash), true);
  assert.equal(await verifyPassword('not-the-password', stored.passwordHash), false);
  const byToken = await getInvitationByTokenHash(hashToken(tokenFromUrl(created.inviteUrl)));
  assert.ok(byToken?.usedAt !== null);
});

test('accept with a full-admin invite creates an admin-role account with full (NULL) permissions', async () => {
  const created = await createInvitationForAdmin('admin-full', {
    firstName: 'Omar',
    lastName: 'Ali',
    email: 'omar@example.com',
  });
  assert.ok(!('error' in created));
  const result = await acceptInvitation(tokenFromUrl(created.inviteUrl), 'another-pass-1');
  assert.ok(!('error' in result));
  assert.equal(result.user.role, 'admin');
  assert.equal(result.user.isAdmin, true);
  assert.equal(result.user.adminPermissions, undefined);
});

test('expired token rejected by accept and by preview', async () => {
  const rawToken = 'expired-token-value';
  await createInvitation({
    email: 'old@example.com',
    firstName: 'Old',
    lastName: 'Invite',
    grants: { isAdmin: true, adminPermissions: null },
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() - 1000),
    invitedById: 'admin-full',
  });
  assert.deepEqual(await acceptInvitation(rawToken, 'some-password-1'), {
    error: 'This invitation link is invalid or has expired',
  });
  assert.deepEqual(await getInvitationPreview(rawToken), {
    error: 'This invitation link is invalid or has expired',
  });
  assert.deepEqual(await acceptInvitation('no-such-token', 'some-password-1'), {
    error: 'This invitation link is invalid or has expired',
  });
});

test('used token cannot be reused', async () => {
  const created = await createInvitationForAdmin('admin-full', {
    firstName: 'Nadia',
    lastName: 'Khan',
    email: 'nadia@example.com',
  });
  assert.ok(!('error' in created));
  const token = tokenFromUrl(created.inviteUrl);
  assert.ok(!('error' in await acceptInvitation(token, 'my-secret-pass')));
  assert.deepEqual(await acceptInvitation(token, 'my-secret-pass'), {
    error: 'This invitation link is invalid or has expired',
  });
  assert.deepEqual(await getInvitationPreview(token), {
    error: 'This invitation link is invalid or has expired',
  });
});

test('duplicate claim rejected without consuming the token', async () => {
  const created = await createInvitationForAdmin('admin-full', {
    firstName: 'Late',
    lastName: 'Account',
    email: 'late@example.com',
  });
  assert.ok(!('error' in created));
  const token = tokenFromUrl(created.inviteUrl);
  // An account for the email appears between invite and accept.
  fake.seed('User', [
    {
      id: 'late-user-2',
      name: 'Late Account',
      email: 'late@example.com',
      passwordHash: '$2b$12$dummyhashdummyhashdummyhashdummyhashdummyhashdummyha',
      role: 'student',
      status: 'active',
      joinedAt: new Date('2024-01-01'),
    },
  ]);
  assert.deepEqual(await acceptInvitation(token, 'my-secret-pass'), {
    error: 'An account with this email already exists. Please sign in instead.',
  });
  const invitation = await getInvitationByTokenHash(hashToken(token));
  assert.equal(invitation?.usedAt, null);
});

// ---------------------------------------------------------------------------
// Case A: existing account + revoke safety
// ---------------------------------------------------------------------------

test('Case A: inviting an existing email is a 409; the direct grant preserves the teacher role/flag', async () => {
  const result = await createInvitationForAdmin('admin-full', {
    firstName: 'Teacher',
    lastName: 'One',
    email: 'teacher-1@example.com',
  });
  assert.ok('error' in result);
  assert.equal(result.status, 409);
  assert.match(result.error, /already exists/);

  const granted = await updateAdminAccess('official-1', 'teacher-1', {
    permissions: { courses: true },
  });
  assert.ok(!('error' in granted));
  assert.equal(granted.user.isAdmin, true);
  assert.equal(granted.user.isTeacher, true);
  assert.equal(granted.user.role, 'instructor');
});

test('revoke does not delete the teacher account/data', async () => {
  await updateAdminAccess('official-1', 'teacher-1', { permissions: { courses: true } });
  const revoked = await revokeAdminAccess('official-1', 'teacher-1');
  assert.ok(!('error' in revoked));
  assert.equal(revoked.user.isAdmin, false);
  assert.equal(revoked.user.isTeacher, true);
  assert.equal(revoked.user.role, 'instructor');
  const stored = await getUserById('teacher-1');
  assert.ok(stored);
  assert.equal(stored.email, 'teacher-1@example.com');
  assert.equal(stored.isTeacher, true);
});

// ---------------------------------------------------------------------------
// Resend + revoke (service)
// ---------------------------------------------------------------------------

test('resend invalidates the old token and issues a new one', async () => {
  const created = await createInvitationForAdmin('admin-full', {
    firstName: 'Nadia',
    lastName: 'Khan',
    email: 'nadia@example.com',
  });
  assert.ok(!('error' in created));
  const oldToken = tokenFromUrl(created.inviteUrl);
  const resent = await resendInvitation('admin-full', created.invitation.id, {
    baseUrl: 'http://localhost:3000',
  });
  assert.ok(!('error' in resent));
  const newToken = tokenFromUrl(resent.inviteUrl);
  assert.notEqual(newToken, oldToken);
  assert.deepEqual(await acceptInvitation(oldToken, 'my-secret-pass'), {
    error: 'This invitation link is invalid or has expired',
  });
  assert.ok(!('error' in await acceptInvitation(newToken, 'my-secret-pass')));
});

test('revoke deletes an unused invitation; a used one cannot be revoked', async () => {
  const created = await createInvitationForAdmin('admin-full', {
    firstName: 'Nadia',
    lastName: 'Khan',
    email: 'nadia@example.com',
  });
  assert.ok(!('error' in created));
  assert.deepEqual(await revokeInvitation('admin-full', created.invitation.id), { success: true });
  assert.equal(await getInvitationById(created.invitation.id), null);
  assert.deepEqual(await revokeInvitation('admin-full', created.invitation.id), {
    error: 'Invitation not found',
    status: 404,
  });

  const used = await createInvitationForAdmin('admin-full', {
    firstName: 'Omar',
    lastName: 'Ali',
    email: 'omar@example.com',
  });
  assert.ok(!('error' in used));
  assert.ok(!('error' in await acceptInvitation(tokenFromUrl(used.inviteUrl), 'another-pass-1')));
  const revokeUsed = await revokeInvitation('admin-full', used.invitation.id);
  assert.ok('error' in revokeUsed);
  assert.equal(revokeUsed.status, 400);
});

// ---------------------------------------------------------------------------
// RBAC: only full admins may manage invitations
// ---------------------------------------------------------------------------

test('non-full-admin cannot create invitations (service)', async () => {
  const result = await createInvitationForAdmin('restricted-1', {
    firstName: 'Nadia',
    lastName: 'Khan',
    email: 'nadia@example.com',
  });
  assert.ok('error' in result);
  assert.equal(result.status, 403);
  const listed = await listInvitationsForAdmin('restricted-1');
  assert.ok('error' in listed);
  assert.equal(listed.status, 403);
});

test('invitation routes: 401 unauthenticated, 403 restricted admin, 403 non-official full admin, 201 official; list hides the token hash', async () => {
  const { GET, POST } = await import('../app/api/admin/access/invitations/route');

  __setTestSession(null);
  assert.equal((await GET()).status, 401);
  assert.equal(
    (await POST(jsonReq('http://localhost/api/admin/access/invitations', 'POST', {
      firstName: 'Nadia',
      lastName: 'Khan',
      email: 'nadia@example.com',
    }))).status,
    401,
  );

  __setTestSession(RESTRICTED);
  assert.equal((await GET()).status, 403);
  assert.equal(
    (await POST(jsonReq('http://localhost/api/admin/access/invitations', 'POST', {
      firstName: 'Nadia',
      lastName: 'Khan',
      email: 'nadia@example.com',
    }))).status,
    403,
  );

  // Phase 5, Module 23: a non-official full admin is no longer enough.
  __setTestSession(FULL);
  assert.equal((await GET()).status, 403);
  assert.equal(
    (await POST(jsonReq('http://localhost/api/admin/access/invitations', 'POST', {
      firstName: 'Nadia',
      lastName: 'Khan',
      email: 'nadia@example.com',
    }))).status,
    403,
  );

  __setTestSession(OFFICIAL);
  const res = await POST(
    jsonReq('http://localhost/api/admin/access/invitations', 'POST', {
      firstName: 'Nadia',
      lastName: 'Khan',
      email: 'nadia@example.com',
    }),
  );
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.emailSent, false);
  assert.ok(body.inviteUrl.includes('/auth/accept-invitation?token='));

  const list = await GET();
  assert.equal(list.status, 200);
  const listed = await list.json();
  assert.equal(listed.invitations.length, 1);
  assert.equal(listed.invitations[0].email, 'nadia@example.com');
  assert.equal(listed.invitations[0].status, 'pending');
  assert.equal('tokenHash' in listed.invitations[0], false);
});

test('DELETE route revokes an unused invitation; resend route mints a fresh link', async () => {
  const { POST } = await import('../app/api/admin/access/invitations/route');
  const { DELETE } = await import('../app/api/admin/access/invitations/[id]/route');
  const { POST: resend } = await import('../app/api/admin/access/invitations/[id]/resend/route');

  __setTestSession(OFFICIAL);
  const created = await POST(
    jsonReq('http://localhost/api/admin/access/invitations', 'POST', {
      firstName: 'Nadia',
      lastName: 'Khan',
      email: 'nadia@example.com',
    }),
  );
  const createdBody = await created.json();
  const id = createdBody.invitation.id as string;

  __setTestSession(RESTRICTED);
  assert.equal(
    (await DELETE(new NextRequest(`http://localhost/api/admin/access/invitations/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    })).status,
    403,
  );

  __setTestSession(OFFICIAL);
  const resent = await resend(
    jsonReq(`http://localhost/api/admin/access/invitations/${id}/resend`, 'POST'),
    { params: Promise.resolve({ id }) },
  );
  assert.equal(resent.status, 201);
  const resentBody = await resent.json();
  assert.notEqual(resentBody.inviteUrl, createdBody.inviteUrl);
  const newId = resentBody.invitation.id as string;

  const deleted = await DELETE(
    new NextRequest(`http://localhost/api/admin/access/invitations/${newId}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: newId }) },
  );
  assert.equal(deleted.status, 200);
  assert.equal(await getInvitationById(newId), null);
});

// ---------------------------------------------------------------------------
// Accept route: preview + password rules
// ---------------------------------------------------------------------------

test('accept route: preview prefills email; mismatched/short passwords rejected; accept succeeds', async () => {
  const { GET, POST } = await import('../app/api/auth/accept-invitation/route');

  const noToken = await GET(new NextRequest('http://localhost/api/auth/accept-invitation'));
  assert.equal(noToken.status, 400);
  const unknown = await GET(
    new NextRequest('http://localhost/api/auth/accept-invitation?token=nope'),
  );
  assert.equal(unknown.status, 400);

  const created = await createInvitationForAdmin('admin-full', {
    firstName: 'Nadia',
    lastName: 'Khan',
    email: 'nadia@example.com',
  });
  assert.ok(!('error' in created));
  const token = tokenFromUrl(created.inviteUrl);

  const preview = await GET(
    new NextRequest(`http://localhost/api/auth/accept-invitation?token=${token}`),
  );
  assert.equal(preview.status, 200);
  const previewBody = await preview.json();
  assert.equal(previewBody.email, 'nadia@example.com');
  assert.equal(previewBody.firstName, 'Nadia');

  const mismatch = await POST(
    jsonReq('http://localhost/api/auth/accept-invitation', 'POST', {
      token,
      password: 'my-secret-pass',
      confirmPassword: 'different-pass',
    }),
  );
  assert.equal(mismatch.status, 400);

  const short = await POST(
    jsonReq('http://localhost/api/auth/accept-invitation', 'POST', {
      token,
      password: 'short',
    }),
  );
  assert.equal(short.status, 400);

  const ok = await POST(
    jsonReq('http://localhost/api/auth/accept-invitation', 'POST', {
      token,
      password: 'my-secret-pass',
      confirmPassword: 'my-secret-pass',
    }),
  );
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { success: true });

  const again = await POST(
    jsonReq('http://localhost/api/auth/accept-invitation', 'POST', {
      token,
      password: 'my-secret-pass',
    }),
  );
  assert.equal(again.status, 400);
});
