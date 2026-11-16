// View-as extension (Eman, 16 Nov 2026): no time limit + ambassador
// view-as + server-side view-only enforcement.
//
// (a) The ADM-02 30-minute TTL is REMOVED — a minted token carries no
//     expiry, and startViewAs / startAmbassadorViewAs return none.
// (b) The student layout admits a view-as session to exactly ONE
//     route — /student/ambassador — and bounces every other
//     /student/* route back to the dashboard; teacher view-as still
//     goes to /instructor/dashboard.
// (c) Write APIs reject mutations in view-as mode (403) — teacher +
//     ambassador mutations — while legitimate use still works.
// (d) The admin Ambassadors list renders one Switch per linked,
//     active ambassador row.
//
// Handler tests run on the fake db + direct route-handler invocation
// (same pattern as tests/security-group-a.test.ts). The layout and
// client-flow assertions are source/static-markup, like
// tests/view-as-instructors.test.ts — there is no jsdom here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { mintViewAsToken, verifyViewAsToken } from '../lib/view-as';
import { startAmbassadorViewAs, startViewAs } from '../lib/services/recruitment-service';
import type { Actor } from '../lib/services/errors';
import type { SessionUser } from '../lib/services/auth-service';
import type { AmbassadorWithStats } from '../lib/db/types';
import AmbassadorsClient from '../app/admin/ambassadors/ambassadors-client';
import { PATCH as patchAmbassador } from '../app/api/student/ambassador/route';
import { POST as postAmbassadorMessage } from '../app/api/student/ambassador/messages/route';
import { POST as postProgress } from '../app/api/student/courses/[id]/progress/route';
import { POST as postReadAll } from '../app/api/notifications/read-all/route';
import { PUT as putPreferences } from '../app/api/notifications/preferences/route';
import { POST as postMarkRead } from '../app/api/notifications/[id]/read/route';
import { POST as postAcknowledge } from '../app/api/notifications/[id]/acknowledge/route';
import { DELETE as deleteNotification } from '../app/api/notifications/[id]/route';
import { POST as postApplicantApplication } from '../app/api/applicant/applications/route';
import { POST as postInstructorAnnouncement } from '../app/api/instructor/announcements/route';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const D = (s: string) => new Date(s);

const ADMIN_ACTOR: Actor = { id: 'admin-1', role: 'admin' as const, isAdmin: true };
const ADMIN_SESSION: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin', isAdmin: true };
const TEACHER_SESSION: SessionUser = { id: 'teacher-1', name: 'Tea Cher', email: 'teacher@example.com', role: 'instructor', isTeacher: true };
const AMB_SESSION: SessionUser = { id: 'amb-user', name: 'Ayesha', email: 'ayesha@example.com', role: 'student' };
const STUDENT_SESSION: SessionUser = { id: 'student-1', name: 'Stu Dent', email: 'student@example.com', role: 'student' };
const AMB_VIEWAS_SESSION: SessionUser = {
  ...AMB_SESSION,
  viewAs: { adminId: 'admin-1', adminName: 'Admin', kind: 'ambassador' },
};
const TEACHER_VIEWAS_SESSION: SessionUser = {
  ...TEACHER_SESSION,
  viewAs: { adminId: 'admin-1', adminName: 'Admin', kind: 'teacher' },
};

let fake: FakeDb;

function seedBase() {
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: 'x', role: 'admin', status: 'active', joinedAt: D('2026-01-01') },
    { id: 'teacher-1', name: 'Tea Cher', email: 'teacher@example.com', passwordHash: 'x', role: 'instructor', status: 'active', joinedAt: D('2026-01-01') },
    { id: 'amb-user', name: 'Ayesha', email: 'ayesha@example.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2026-01-01') },
    { id: 'amb-user-inactive', name: 'Ina Ctive', email: 'inactive@example.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2026-01-01') },
    { id: 'student-1', name: 'Stu Dent', email: 'student@example.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2026-01-01') },
  ]);
  fake.seed('Ambassador', [
    { id: 'amb-1', userId: 'amb-user', email: 'ayesha@example.com', referralCode: 'ABCDEF', status: 'active', createdAt: D('2026-01-01'), updatedAt: D('2026-01-01') },
    { id: 'amb-2', userId: 'amb-user-inactive', email: 'inactive@example.com', referralCode: 'GHIJKL', status: 'inactive', createdAt: D('2026-01-01'), updatedAt: D('2026-01-01') },
  ]);
}

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof data?.error === 'string' ? data.error : '';
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedBase();
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ---------------------------------------------------------------------------
// (a) No time limit — the ADM-02 TTL is gone
// ---------------------------------------------------------------------------

test('(a) view-as tokens carry no expiry: mint + verify, no expiresAt anywhere in the code', () => {
  const teacher = mintViewAsToken('admin-1', 'teacher-1', 'teacher');
  assert.equal(typeof teacher.token, 'string');
  assert.ok(!('expiresAt' in teacher));
  const payload = verifyViewAsToken(teacher.token);
  assert.ok(payload);
  assert.equal(payload.kind, 'teacher');
  assert.equal(payload.targetUserId, 'teacher-1');
  assert.ok(!('expiresAt' in payload));

  const ambassador = mintViewAsToken('admin-1', 'amb-user', 'ambassador');
  assert.equal(verifyViewAsToken(ambassador.token)?.kind, 'ambassador');

  const libSrc = read('lib/view-as.ts');
  assert.ok(!libSrc.includes('VIEW_AS_TTL_MS'), 'no TTL constant remains');
  assert.ok(!libSrc.includes('30 * 60 * 1000'), 'no 30-minute value remains');
  for (const rel of ['app/api/admin/view-as/route.ts', 'app/api/admin/view-as/ambassador/route.ts']) {
    assert.ok(!read(rel).includes('expiresAt'), `${rel} returns no expiry`);
  }
});

test('(a) startViewAs + startAmbassadorViewAs return no expiry; ambassador mint refuses non-ambassadors', async () => {
  const teacher = await startViewAs(ADMIN_ACTOR, 'teacher-1');
  assert.ok(!('error' in teacher), JSON.stringify(teacher));
  assert.ok(!('expiresAt' in teacher), 'startViewAs returns no expiry');
  assert.equal(verifyViewAsToken(teacher.token)?.kind, 'teacher');

  const ambassador = await startAmbassadorViewAs(ADMIN_ACTOR, 'amb-user');
  assert.ok(!('error' in ambassador), JSON.stringify(ambassador));
  assert.ok(!('expiresAt' in ambassador), 'startAmbassadorViewAs returns no expiry');
  assert.equal(ambassador.ambassador.id, 'amb-user');
  assert.equal(verifyViewAsToken(ambassador.token)?.kind, 'ambassador');

  // A plain student (no Ambassador row) cannot be viewed.
  const plain = await startAmbassadorViewAs(ADMIN_ACTOR, 'student-1');
  assert.ok('error' in plain);
  assert.equal(plain.status, 403);
  // An inactive ambassador cannot be viewed.
  const inactive = await startAmbassadorViewAs(ADMIN_ACTOR, 'amb-user-inactive');
  assert.ok('error' in inactive);
  assert.equal(inactive.status, 403);
  // Self-view is refused.
  const self = await startAmbassadorViewAs(ADMIN_ACTOR, 'admin-1');
  assert.ok('error' in self);
  assert.equal(self.status, 400);
  // Non-admins cannot mint.
  const nonAdmin = await startAmbassadorViewAs({ id: 'teacher-1', role: 'instructor' as const, isTeacher: true }, 'amb-user');
  assert.ok('error' in nonAdmin);
  assert.equal(nonAdmin.status, 403);
});

// ---------------------------------------------------------------------------
// (b) Student layout: ambassador view-as opens ONLY /student/ambassador
// ---------------------------------------------------------------------------

test('(b) student layout admits ambassador view-as to /student/ambassador only; teacher view-as still bounces', () => {
  const src = read('app/student/layout.tsx');
  // Targeted exception: the ambassador dashboard is the one allowed route.
  assert.ok(src.includes("pathname !== '/student/ambassador'"));
  assert.ok(src.includes("redirect('/student/ambassador')"));
  // Teacher view-as still never opens a student portal.
  assert.ok(src.includes("redirect('/instructor/dashboard')"));
  // The old blanket redirect is gone.
  assert.ok(!src.includes("if (session?.viewAs) redirect('/instructor/dashboard');"));
  // The banner is the way back, returning to /admin/ambassadors.
  assert.ok(src.includes('<ViewAsBanner'));
  assert.ok(src.includes('returnPath="ambassadors"'));
  assert.ok(src.includes('viewedPortal="ambassador\'s"'));
  // Ambassador view-as sees only the Ambassador nav item.
  assert.ok(src.includes("item.href === '/student/ambassador'"));
  // The path comes from the proxy's x-pathname header (same seam as
  // the admin layout), with a missing header treated as "cannot tell".
  assert.ok(src.includes("get('x-pathname')"));
  assert.ok(src.includes('pathname !== null'));
});

// ---------------------------------------------------------------------------
// (c) View-only enforcement — mutations refuse a view-as session (403)
// ---------------------------------------------------------------------------

test('(c) ambassador dashboard mutations: PATCH group + POST message are 403 in view-as, work normally otherwise', async () => {
  // View-as: both mutations refuse, before any DB work.
  __setTestSession(AMB_VIEWAS_SESSION);
  const patchBlocked = await patchAmbassador(jsonReq('http://localhost/api/student/ambassador', 'PATCH', { groupMemberCount: 99 }));
  assert.equal(patchBlocked.status, 403);
  assert.match(await readError(patchBlocked), /viewing/i);
  const msgBlocked = await postAmbassadorMessage(jsonReq('http://localhost/api/student/ambassador/messages', 'POST', { message: 'hello admin' }));
  assert.equal(msgBlocked.status, 403);
  assert.match(await readError(msgBlocked), /viewing/i);

  // Normal session: the same calls succeed (legitimate use intact).
  __setTestSession(AMB_SESSION);
  const patched = await patchAmbassador(jsonReq('http://localhost/api/student/ambassador', 'PATCH', { groupMemberCount: 42 }));
  assert.equal(patched.status, 200);
  const patchedBody = (await patched.json()) as { ambassador: { groupMemberCount: number } };
  assert.equal(patchedBody.ambassador.groupMemberCount, 42);
  const sent = await postAmbassadorMessage(jsonReq('http://localhost/api/student/ambassador/messages', 'POST', { message: 'hello admin' }));
  assert.equal(sent.status, 201);
});

test('(c) student progress + notification mutations are 403 in view-as', async () => {
  __setTestSession(AMB_VIEWAS_SESSION);
  // Progress: refused before the enrollment lookup — even a
  // non-enrolled student gets the view-only 403, not a 404.
  const progress = await postProgress(
    jsonReq('http://localhost/api/student/courses/course-1/progress', 'POST', { lessonId: 'lesson-1', completed: true }),
    { params: Promise.resolve({ id: 'course-1' }) },
  );
  assert.equal(progress.status, 403);
  assert.match(await readError(progress), /viewing/i);

  // Notification mutations: the portal-shell popups (mounted in
  // every portal) would otherwise let a viewing admin mutate the
  // viewed person's notification state as them.
  const readAll = await postReadAll();
  assert.equal(readAll.status, 403);
  const prefs = await putPreferences(jsonReq('http://localhost/api/notifications/preferences', 'PUT', { inApp: false }));
  assert.equal(prefs.status, 403);
  const read = await postMarkRead(new NextRequest('http://localhost/api/notifications/notif-1/read', { method: 'POST' }), { params: Promise.resolve({ id: 'notif-1' }) });
  assert.equal(read.status, 403);
  const ack = await postAcknowledge(new NextRequest('http://localhost/api/notifications/notif-1/acknowledge', { method: 'POST' }), { params: Promise.resolve({ id: 'notif-1' }) });
  assert.equal(ack.status, 403);
  const del = await deleteNotification(new NextRequest('http://localhost/api/notifications/notif-1', { method: 'DELETE' }), { params: Promise.resolve({ id: 'notif-1' }) });
  assert.equal(del.status, 403);

  // Normal session: the same calls pass the view-only gate (read-all
  // succeeds on an empty inbox; an unknown id 404s instead of 403).
  __setTestSession(AMB_SESSION);
  const readAllOk = await postReadAll();
  assert.equal(readAllOk.status, 200);
  const readOk = await postMarkRead(new NextRequest('http://localhost/api/notifications/notif-1/read', { method: 'POST' }), { params: Promise.resolve({ id: 'notif-1' }) });
  assert.equal(readOk.status, 404);
});

test('(c) filing a recruitment application + posting an instructor announcement are 403 in view-as', async () => {
  // Applicant POST: without the check, a viewing admin could file an
  // application AS the viewed teacher (the service requires the
  // application email to match the account email).
  __setTestSession(TEACHER_VIEWAS_SESSION);
  const filed = await postApplicantApplication(jsonReq('http://localhost/api/applicant/applications', 'POST', { fullName: 'Tea Cher' }));
  assert.equal(filed.status, 403);
  assert.match(await readError(filed), /viewing/i);

  // Instructor announcement: the teacher-portal write path.
  const announced = await postInstructorAnnouncement(
    jsonReq('http://localhost/api/instructor/announcements', 'POST', { title: 'Hi', content: 'Hello', courseId: 'x' }),
  );
  assert.equal(announced.status, 403);
  assert.match(await readError(announced), /viewing/i);
});

// ---------------------------------------------------------------------------
// (d) Admin Ambassadors list: one Switch per linked, active ambassador
// ---------------------------------------------------------------------------

function ambassadorFixture(id: string, userId: string | undefined, status: 'active' | 'inactive'): AmbassadorWithStats {
  return {
    id,
    userId,
    email: `${id}@example.com`,
    referralCode: 'ABCDEF',
    status,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    stats: { clicks: 0, signups: 0, enrollments: 0, payments: 0 },
    teamLevel1: [],
    teamLevel2: [],
  };
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test('(d) ambassadors list: one Switch button per LINKED active ambassador row, none otherwise', () => {
  const markup = renderToStaticMarkup(
    createElement(AmbassadorsClient, {
      initialApplications: [],
      total: 0,
      tableMissing: false,
      referralReady: true,
      initialAmbassadors: [
        ambassadorFixture('amb-1', 'amb-user', 'active'),
        ambassadorFixture('amb-2', undefined, 'active'),
        ambassadorFixture('amb-3', 'amb-user-3', 'inactive'),
      ],
      ambassadorNames: { 'amb-1': 'Ayesha', 'amb-2': 'Bilal', 'amb-3': 'Chanda' },
      initialMessages: [],
      unreadMessages: 0,
      initialMeetingLink: '',
    }),
  );
  // All three ambassadors render.
  assert.ok(markup.includes('Ayesha'));
  assert.ok(markup.includes('Bilal'));
  assert.ok(markup.includes('Chanda'));
  // Exactly one Switch button — the linked active ambassador's row.
  // The unlinked ambassador has no student account to view, and the
  // inactive one is refused by the service, so a button there would
  // only ever error.
  assert.equal(countOccurrences(markup, 'Switch to Ambassador Dashboard'), 1);
});

test('(d) ambassador Switch mints via the ambassador view-as route and lands on the ambassador dashboard', () => {
  const src = read('app/admin/ambassadors/ambassadors-client.tsx');
  assert.ok(src.includes("fetch('/api/admin/view-as/ambassador'"));
  assert.ok(src.includes("window.location.href = '/student/ambassador'"));
});
