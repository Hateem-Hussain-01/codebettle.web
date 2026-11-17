// Team view-as (Eman, 17 Nov 2026): admin opens a team member's
// portal in view-as mode, no time limit, view-only.
//
// (a) The view-as token kind 'team' — mint + verify, no expiry, and
//     startTeamViewAs mints only for members holding ACTIVE team
//     access (refusing non-admins, self-view, unknown/inactive users,
//     and users without a grant).
// (b) The team layout admits a kind-'team' view-as session, bounces
//     ambassador view-as back to /student/ambassador (NOT the
//     instructor dashboard), keeps the teacher bounce to
//     /instructor/dashboard, and renders the banner returning to
//     /admin/team.
// (c) Team write APIs refuse mutations in view-as mode (403) — task
//     status, file upload, file delete, credit redemption — while
//     legitimate use still works.
// (d) The admin Team list renders one Switch per LINKED active grant
//     row (source assertions — the client uses useRouter, which has
//     no router context under renderToStaticMarkup).
// (e) The portal switcher is suppressed while viewing, in EVERY
//     portal — the banner is the only way back.
//
// Handler tests run on the fake db + direct route-handler invocation
// (same pattern as tests/view-as-extension.test.ts). Layout and
// client-flow assertions are source/static, like
// tests/view-as-instructors.test.ts — there is no jsdom here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { mintViewAsToken, verifyViewAsToken } from '../lib/view-as';
import { startTeamViewAs } from '../lib/services/recruitment-service';
import { createTeamFile, createTeamTask, grantTeamAccess, revokeTeamAccess } from '../lib/db/team';
import { getPortalSwitch } from '../lib/portal-switch';
import type { Actor } from '../lib/services/errors';
import type { SessionUser } from '../lib/services/auth-service';
import { PATCH as patchTask } from '../app/api/team/tasks/[id]/route';
import { POST as postFileUpload } from '../app/api/team/files/route';
import { DELETE as deleteFile } from '../app/api/team/files/[id]/route';
import { POST as postRedeem } from '../app/api/team/credits/redeem/route';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const D = (s: string) => new Date(s);

const ADMIN_ACTOR: Actor = { id: 'admin-1', role: 'admin' as const, isAdmin: true };
const ADMIN_SESSION: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin', isAdmin: true };
const MEMBER: SessionUser = { id: 'member-1', name: 'Mary Am', email: 'maryam@codebettle.com', role: 'student' };
const MEMBER_VIEWAS_SESSION: SessionUser = {
  ...MEMBER,
  viewAs: { adminId: 'admin-1', adminName: 'Admin', kind: 'team' },
};

let fake: FakeDb;

async function seedBase() {
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: 'x', role: 'admin', status: 'active', joinedAt: D('2026-01-01') },
    { id: 'member-1', name: 'Mary Am', email: 'maryam@codebettle.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2026-01-01') },
    { id: 'member-revoked', name: 'Re Voked', email: 'revoked@codebettle.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2026-01-01') },
    { id: 'member-inactive', name: 'Ina Ctive', email: 'inactive@codebettle.com', passwordHash: 'x', role: 'student', status: 'suspended', joinedAt: D('2026-01-01') },
    { id: 'plain-1', name: 'Plain User', email: 'plain@codebettle.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2026-01-01') },
  ]);
  // Active grant for the member (links userId — the user exists),
  // a grant that is then revoked, and a grant for the suspended user
  // (active grant, inactive account — the mint must still refuse).
  await grantTeamAccess({ email: MEMBER.email, grantedBy: ADMIN_ACTOR.id });
  await grantTeamAccess({ email: 'revoked@codebettle.com', grantedBy: ADMIN_ACTOR.id });
  await revokeTeamAccess('revoked@codebettle.com');
  await grantTeamAccess({ email: 'inactive@codebettle.com', grantedBy: ADMIN_ACTOR.id });
}

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function multipartReq(url: string): NextRequest {
  const boundary = '----team-viewas-test-boundary';
  const body =
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="note.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--${boundary}--\r\n`;
  return new NextRequest(url, {
    method: 'POST',
    body,
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  });
}

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof data?.error === 'string' ? data.error : '';
}

test.beforeEach(async () => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  await seedBase();
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ---------------------------------------------------------------------------
// (a) kind 'team' token + startTeamViewAs
// ---------------------------------------------------------------------------

test("(a) view-as tokens of kind 'team' mint + verify, carry no expiry", () => {
  const minted = mintViewAsToken('admin-1', 'member-1', 'team');
  assert.equal(typeof minted.token, 'string');
  assert.ok(!('expiresAt' in minted));
  const payload = verifyViewAsToken(minted.token);
  assert.ok(payload);
  assert.equal(payload.kind, 'team');
  assert.equal(payload.targetUserId, 'member-1');
  assert.equal(payload.adminId, 'admin-1');
  assert.ok(!('expiresAt' in payload));

  // The shape check admits exactly the three kinds.
  const libSrc = read('lib/view-as.ts');
  assert.ok(libSrc.includes("kind !== 'team'"), 'team is in the token shape check');
  assert.ok(libSrc.includes("export type ViewAsKind = 'teacher' | 'ambassador' | 'team'"));
  assert.ok(!libSrc.includes('VIEW_AS_TTL_MS'), 'no TTL constant remains');
});

test('(a) startTeamViewAs mints for an active member, refuses everyone else, returns no expiry', async () => {
  const ok = await startTeamViewAs(ADMIN_ACTOR, 'member-1');
  assert.ok(!('error' in ok), JSON.stringify(ok));
  assert.ok(!('expiresAt' in ok), 'startTeamViewAs returns no expiry');
  assert.equal(ok.member.id, 'member-1');
  assert.equal(verifyViewAsToken(ok.token)?.kind, 'team');

  // Non-admins cannot mint.
  const nonAdmin = await startTeamViewAs({ id: 'member-1', role: 'student' as const }, 'member-1');
  assert.ok('error' in nonAdmin);
  assert.equal(nonAdmin.status, 403);
  // Self-view is refused.
  const self = await startTeamViewAs(ADMIN_ACTOR, 'admin-1');
  assert.ok('error' in self);
  assert.equal(self.status, 400);
  // Unknown user.
  const unknown = await startTeamViewAs(ADMIN_ACTOR, 'no-such-user');
  assert.ok('error' in unknown);
  assert.equal(unknown.status, 404);
  // Suspended account (active grant, inactive user).
  const suspended = await startTeamViewAs(ADMIN_ACTOR, 'member-inactive');
  assert.ok('error' in suspended);
  assert.equal(suspended.status, 400);
  // A user with no team grant at all.
  const plain = await startTeamViewAs(ADMIN_ACTOR, 'plain-1');
  assert.ok('error' in plain);
  assert.equal(plain.status, 403);
  // A revoked grant: the member lost team access.
  const revoked = await startTeamViewAs(ADMIN_ACTOR, 'member-revoked');
  assert.ok('error' in revoked);
  assert.equal(revoked.status, 403);
});

// ---------------------------------------------------------------------------
// (b) Team layout: admit team view-as, bounce the other kinds right
// ---------------------------------------------------------------------------

test("(b) team layout admits kind 'team', bounces ambassador to /student/ambassador, teacher to /instructor/dashboard", () => {
  const src = read('app/team/layout.tsx');
  // The old blanket bounce is gone — no view-as kind is bounced
  // unconditionally any more.
  assert.ok(!src.includes("if (session.viewAs) redirect('/instructor/dashboard');"));
  // Ambassador view-as belongs on the ambassador dashboard.
  assert.ok(src.includes("if (session.viewAs.kind === 'ambassador') redirect('/student/ambassador');"));
  // Every other kind except 'team' still bounces to the teacher portal.
  assert.ok(src.includes("if (session.viewAs.kind !== 'team') redirect('/instructor/dashboard');"));
  // Team view-as is admitted: the banner renders for it, returning
  // to /admin/team.
  assert.ok(src.includes('<ViewAsBanner'));
  assert.ok(src.includes('returnPath="team"'));
  assert.ok(src.includes('viewedPortal="team member\'s"'));
  // The banner is also present on the "not set up yet" branch, so a
  // viewing admin still has an Exit when the tables are missing.
  assert.ok(src.includes("session.viewAs?.kind === 'team'"));
});

// ---------------------------------------------------------------------------
// (c) View-only enforcement — team mutations refuse a view-as session
// ---------------------------------------------------------------------------

test('(c) team task status + file upload + file delete are 403 in view-as, work normally otherwise', async () => {
  const task = await createTeamTask({ title: 'Prepare slides', assigneeEmail: MEMBER.email, createdBy: ADMIN_ACTOR.id });
  const file = await createTeamFile({
    fileName: 'notes.txt',
    storagePath: 'team-files/notes.txt',
    mime: 'text/plain',
    size: 5,
    uploadedBy: MEMBER.id,
  });

  // View-as: all three mutations refuse, before any DB/storage work —
  // even a bogus task id gets the view-only 403, not a 404.
  __setTestSession(MEMBER_VIEWAS_SESSION);
  const taskBlocked = await patchTask(
    jsonReq('http://localhost/api/team/tasks/no-such-task', 'PATCH', { status: 'doing' }),
    { params: Promise.resolve({ id: 'no-such-task' }) },
  );
  assert.equal(taskBlocked.status, 403);
  assert.match(await readError(taskBlocked), /viewing/i);
  const uploadBlocked = await postFileUpload(multipartReq('http://localhost/api/team/files'));
  assert.equal(uploadBlocked.status, 403);
  assert.match(await readError(uploadBlocked), /viewing/i);
  const deleteBlocked = await deleteFile(new NextRequest(`http://localhost/api/team/files/${file.id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id: file.id }),
  });
  assert.equal(deleteBlocked.status, 403);
  assert.match(await readError(deleteBlocked), /viewing/i);

  // Normal session: the same calls pass the view-only gate.
  __setTestSession(MEMBER);
  const moved = await patchTask(
    jsonReq(`http://localhost/api/team/tasks/${task.id}`, 'PATCH', { status: 'doing' }),
    { params: Promise.resolve({ id: task.id }) },
  );
  assert.equal(moved.status, 200);
  const movedBody = (await moved.json()) as { task: { status: string } };
  assert.equal(movedBody.task.status, 'doing');
  // Upload passes the gate and fails on storage config (no Supabase
  // in tests) — 503, not 403.
  const uploaded = await postFileUpload(multipartReq('http://localhost/api/team/files'));
  assert.equal(uploaded.status, 503);
  const deleted = await deleteFile(new NextRequest(`http://localhost/api/team/files/${file.id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id: file.id }),
  });
  assert.equal(deleted.status, 200);
});

test('(c) credit redemption is 403 in view-as (already guarded in PR #66) and reaches the balance check otherwise', async () => {
  __setTestSession(MEMBER_VIEWAS_SESSION);
  const blocked = await postRedeem(jsonReq('http://localhost/api/team/credits/redeem', 'POST', { goody: 'pen' }));
  assert.equal(blocked.status, 403);
  assert.match(await readError(blocked), /viewing/i);

  // Normal session: passes the gate, then the balance check refuses
  // (0 credits < the placeholder price) — 400, not 403.
  __setTestSession(MEMBER);
  const refused = await postRedeem(jsonReq('http://localhost/api/team/credits/redeem', 'POST', { goody: 'pen' }));
  assert.equal(refused.status, 400);
  assert.match(await readError(refused), /Not enough credits/);
});

// ---------------------------------------------------------------------------
// (d) Admin Team list: one Switch per LINKED active grant row
// ---------------------------------------------------------------------------

test('(d) team list Switch mints via the team view-as route and lands on the team dashboard', () => {
  const src = read('app/admin/team/team-client.tsx');
  assert.ok(src.includes("fetch('/api/admin/view-as/team'"));
  assert.ok(src.includes("window.location.href = '/team/dashboard'"));
  assert.ok(src.includes('Switch to Team Portal'));
  // Only linked (userId) active grants get the button — an unlinked
  // grant has no account to view, a revoked grant is refused.
  assert.ok(src.includes('g.userId && g.status === \'active\''));
});

// ---------------------------------------------------------------------------
// (e) Portal switcher suppressed while viewing, in every portal
// ---------------------------------------------------------------------------

test('(e) getPortalSwitch returns null for a viewing session from every portal', () => {
  // A dual-role user (teacher + admin) would normally be offered a
  // switch from every portal — while viewing, nothing.
  const viewing: SessionUser = {
    id: 'teacher-1',
    name: 'Tea Cher',
    email: 'teacher@example.com',
    role: 'instructor',
    isTeacher: true,
    isAdmin: true,
    viewAs: { adminId: 'admin-1', adminName: 'Admin', kind: 'team' },
  };
  for (const path of ['/admin/dashboard', '/instructor/dashboard', '/team/dashboard', '/student/dashboard']) {
    assert.equal(getPortalSwitch(viewing, path, 'admin', true), null, `no switch from ${path} while viewing`);
  }
  // The sharpest case: a team member in their own portal is ALWAYS
  // offered "Switch to Student Portal" normally (unconditional
  // branch) — while viewing as them, that offer must disappear too.
  const teamViewing: SessionUser = {
    ...MEMBER,
    viewAs: { adminId: 'admin-1', adminName: 'Admin', kind: 'team' },
  };
  assert.equal(getPortalSwitch(teamViewing, '/team/dashboard', 'admin', true), null);

  // Control: the same users WITHOUT a viewing session keep their
  // switch options (behaviour preserved outside view-as).
  const { viewAs: _viewAs, ...plain } = viewing;
  assert.equal(getPortalSwitch(plain, '/admin/dashboard', 'admin', true)?.label, 'Switch to Teacher Portal');
  assert.equal(getPortalSwitch({ ...MEMBER }, '/team/dashboard', 'admin', true)?.label, 'Switch to Student Portal');
});
