import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { __clearRateLimits } from '../lib/rate-limit';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  acknowledgeNotification,
  createNotification,
  listNotificationsForUser,
  markNotificationRead,
} from '../lib/db/notifications';
import {
  getSupportRequestById,
  getSupportRequestForStudent,
  listSupportRequestsForStudent,
} from '../lib/db/support-requests';
import { notifyUser } from '../lib/services/notification-service';
import { APPLICATION_FILES_BUCKET } from '../lib/services/application-storage';
import {
  createSupportRequestService,
  updateSupportRequestService,
  uploadSupportRequestAttachment,
} from '../lib/services/support-request-service';
import type { SessionUser } from '../lib/services/auth-service';

const D = (s: string) => new Date(s);

const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };
const STU2: SessionUser = { id: 'stu-2', name: 'Sara', email: 'sara@example.com', role: 'student' };
const INST1: SessionUser = { id: 'inst-1', name: 'Irfan', email: 'irfan@example.com', role: 'instructor' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function formReq(url: string, form: FormData): NextRequest {
  return new NextRequest(url, { method: 'POST', body: form });
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  __clearRateLimits();
  delete process.env.RESEND_API_KEY;
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-03') },
    { id: 'inst-1', name: 'Irfan', email: 'irfan@example.com', passwordHash: '$2b$12$hash', role: 'instructor', isTeacher: true, status: 'active', joinedAt: D('2024-01-04') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 1, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
  __clearRateLimits();
  delete process.env.RESEND_API_KEY;
});

// ---------------------------------------------------------------------------
// Notification categories + prefs bypass
// ---------------------------------------------------------------------------

test('category field is stored; important notices bypass the per-event prefs toggle', async () => {
  // stu-1 has announcements switched OFF.
  fake.seed('User', [
    {
      id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student',
      status: 'active', joinedAt: D('2024-01-02'),
      notificationPrefs: {
        inApp: true, email: false,
        events: { enrollment: true, completion: true, certificate: true, application: true, announcement: false, support_request: true, request_update: true },
      },
    },
  ]);

  // A general announcement is skipped (toggle off).
  const general = await notifyUser('stu-1', {
    type: 'announcement', event: 'announcement', category: 'general',
    title: 'General news', body: 'Nothing urgent',
  });
  assert.ok(general.ok && 'skipped' in general && general.skipped, JSON.stringify(general));
  assert.equal(general.reason, 'event-disabled');

  // An important notice reaches the same user despite the toggle.
  const important = await notifyUser('stu-1', {
    type: 'announcement', event: 'announcement', category: 'important',
    title: 'Important: class moved', body: 'Tomorrow’s class moves to 6 PM',
    requiresAcknowledge: true,
  });
  assert.ok(important.ok && 'notification' in important && important.notification, JSON.stringify(important));
  assert.equal(important.notification.category, 'important');
  assert.equal(important.notification.requiresAcknowledge, true);

  // A special notice also bypasses.
  const special = await notifyUser('stu-1', {
    type: 'announcement', event: 'announcement', category: 'special_notice',
    title: 'Special notice', body: 'Please read this',
  });
  assert.ok(special.ok && 'notification' in special && special.notification, JSON.stringify(special));

  // But inApp off still blocks even an important notice (bypass is
  // the event toggle only — see notification-service.ts).
  fake.seed('User', [
    {
      id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student',
      status: 'active', joinedAt: D('2024-01-03'),
      notificationPrefs: {
        inApp: false, email: false,
        events: { enrollment: true, completion: true, certificate: true, application: true, announcement: false, support_request: true, request_update: true },
      },
    },
  ]);
  const blocked = await notifyUser('stu-2', {
    type: 'announcement', event: 'announcement', category: 'important',
    title: 'Important', body: 'You will not see this in-app',
  });
  assert.ok(blocked.ok && 'skipped' in blocked && blocked.skipped, JSON.stringify(blocked));
  assert.equal(blocked.reason, 'in-app-disabled');
});

test('list filters: ?type=, ?category= and ?pending=true (requiresAcknowledge + unacknowledged, oldest first)', async () => {
  await createNotification({ userId: 'stu-1', type: 'announcement', title: 'A1', body: 'b', category: 'general' });
  await createNotification({ userId: 'stu-1', type: 'announcement', title: 'A2', body: 'b', category: 'important', requiresAcknowledge: true });
  await createNotification({ userId: 'stu-1', type: 'enrollment', title: 'E1', body: 'b', category: 'general', requiresAcknowledge: true });
  const read = await createNotification({ userId: 'stu-1', type: 'announcement', title: 'A3', body: 'b', category: 'warning', requiresAcknowledge: true });
  // Mark A3 read — Phase 7: the pending feed keys on acknowledgedAt,
  // NOT readAt, so a read-but-unacknowledged item STAYS pending.
  await markNotificationRead('stu-1', read.id);

  const byType = await listNotificationsForUser('stu-1', { type: 'enrollment' });
  assert.equal(byType.total, 1);
  assert.equal(byType.items[0].title, 'E1');

  const byCategory = await listNotificationsForUser('stu-1', { category: 'important' });
  assert.equal(byCategory.total, 1);
  assert.equal(byCategory.items[0].title, 'A2');

  const pending = await listNotificationsForUser('stu-1', { pending: true });
  assert.deepEqual(pending.items.map((n) => n.title), ['A2', 'E1', 'A3']);
});

test('pending feed: a read-but-unacknowledged notification stays pending until acknowledged; non-ack items never appear', async () => {
  const mustAck = await createNotification({
    userId: 'stu-1', type: 'announcement', title: 'Must ack', body: 'b',
    category: 'important', requiresAcknowledge: true,
  });
  const pendingIds = async () =>
    (await listNotificationsForUser('stu-1', { pending: true })).items.map((n) => n.id);

  // Unread + unacknowledged: pending.
  assert.deepEqual(await pendingIds(), [mustAck.id]);

  // Marking it read (card click / Mark All Read) must NOT discharge it.
  await markNotificationRead('stu-1', mustAck.id);
  assert.deepEqual(await pendingIds(), [mustAck.id]);

  // Acknowledging removes it from the pending feed.
  await acknowledgeNotification('stu-1', mustAck.id);
  assert.deepEqual(await pendingIds(), []);

  // A non-ack notification never appears in the pending feed, read or not.
  const plain = await createNotification({
    userId: 'stu-1', type: 'announcement', title: 'Plain', body: 'b', category: 'general',
  });
  assert.deepEqual(await pendingIds(), []);
  await markNotificationRead('stu-1', plain.id);
  assert.deepEqual(await pendingIds(), []);
});

// ---------------------------------------------------------------------------
// Acknowledge
// ---------------------------------------------------------------------------

test('acknowledge is idempotent and sets readAt; another user gets null', async () => {
  const { POST } = await import('../app/api/notifications/[id]/acknowledge/route');
  const notif = await createNotification({
    userId: 'stu-1', type: 'announcement', title: 'Please ack', body: 'b',
    category: 'important', requiresAcknowledge: true,
  });

  __setTestSession(STU1);
  const first = await POST(new NextRequest('http://localhost/api/notifications/x/acknowledge', { method: 'POST' }), {
    params: Promise.resolve({ id: notif.id }),
  });
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.ok(firstBody.notification.acknowledgedAt, JSON.stringify(firstBody));
  assert.ok(firstBody.notification.readAt, JSON.stringify(firstBody));

  const second = await POST(new NextRequest('http://localhost/api/notifications/x/acknowledge', { method: 'POST' }), {
    params: Promise.resolve({ id: notif.id }),
  });
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.notification.acknowledgedAt, firstBody.notification.acknowledgedAt);

  // Repo-level: another user cannot acknowledge it.
  assert.equal(await acknowledgeNotification('stu-2', notif.id), null);

  __setTestSession(STU2);
  const other = await POST(new NextRequest('http://localhost/api/notifications/x/acknowledge', { method: 'POST' }), {
    params: Promise.resolve({ id: notif.id }),
  });
  assert.equal(other.status, 404);
});

// ---------------------------------------------------------------------------
// Admin send API targeting
// ---------------------------------------------------------------------------

test('admin send: all / role / user / course targeting, with created + skipped counts', async () => {
  const { POST } = await import('../app/api/admin/notifications/route');

  __setTestSession(STU1);
  const forbidden = await POST(jsonReq('http://localhost/api/admin/notifications', 'POST', {
    title: 'Hi', body: 'Hello', category: 'general', target: { type: 'all' },
  }));
  assert.equal(forbidden.status, 403);

  __setTestSession(ADMIN);
  const badCategory = await POST(jsonReq('http://localhost/api/admin/notifications', 'POST', {
    title: 'Hi', body: 'Hello', category: 'urgent', target: { type: 'all' },
  }));
  assert.equal(badCategory.status, 400);

  const ghostUser = await POST(jsonReq('http://localhost/api/admin/notifications', 'POST', {
    title: 'Hi', body: 'Hello', category: 'general', target: { type: 'user', userId: 'ghost' },
  }));
  assert.equal(ghostUser.status, 404);

  const ghostCourse = await POST(jsonReq('http://localhost/api/admin/notifications', 'POST', {
    title: 'Hi', body: 'Hello', category: 'general', target: { type: 'course', courseId: 'ghost' },
  }));
  assert.equal(ghostCourse.status, 404);

  const all = await POST(jsonReq('http://localhost/api/admin/notifications', 'POST', {
    title: 'Site news', body: 'Hello everyone', category: 'general', target: { type: 'all' },
  }));
  assert.equal(all.status, 200);
  assert.deepEqual(await all.json(), { created: 4, skipped: 0 });

  const students = await POST(jsonReq('http://localhost/api/admin/notifications', 'POST', {
    title: 'Students only', body: 'Hi students', category: 'general', target: { type: 'role', role: 'student' },
  }));
  assert.deepEqual(await students.json(), { created: 2, skipped: 0 });

  const instructors = await POST(jsonReq('http://localhost/api/admin/notifications', 'POST', {
    title: 'Teachers', body: 'Hi teachers', category: 'general', target: { type: 'role', role: 'instructor' },
  }));
  assert.deepEqual(await instructors.json(), { created: 1, skipped: 0 });

  const admins = await POST(jsonReq('http://localhost/api/admin/notifications', 'POST', {
    title: 'Admins', body: 'Hi admins', category: 'general', target: { type: 'role', role: 'admin' },
  }));
  assert.deepEqual(await admins.json(), { created: 1, skipped: 0 });

  const oneUser = await POST(jsonReq('http://localhost/api/admin/notifications', 'POST', {
    title: 'Just you', body: 'Hi Sara', category: 'general', target: { type: 'user', userId: 'stu-2' },
  }));
  assert.deepEqual(await oneUser.json(), { created: 1, skipped: 0 });

  // Course target reaches only enrolled students (stu-1, not stu-2).
  const course = await POST(jsonReq('http://localhost/api/admin/notifications', 'POST', {
    title: 'Web 101 update', body: 'Class moved', category: 'important',
    target: { type: 'course', courseId: 'course-1' }, requiresAcknowledge: true,
  }));
  assert.deepEqual(await course.json(), { created: 1, skipped: 0 });
  const stu1Notes = await listNotificationsForUser('stu-1', { category: 'important' });
  assert.equal(stu1Notes.total, 1);
  assert.equal(stu1Notes.items[0].requiresAcknowledge, true);
  assert.equal((await listNotificationsForUser('stu-2', { category: 'important' })).total, 0);
});

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

test('receipts aggregate read/acknowledged counts per recipient; missing announcement is 404', async () => {
  const { GET } = await import('../app/api/admin/announcements/[id]/receipts/route');
  fake.seed('Announcement', [
    { id: 'ann-1', title: 'Exam week', content: 'Exams start Monday', type: 'site_wide', courseId: null, authorId: 'admin-1', isActive: true, createdAt: D('2024-05-10') },
  ]);
  fake.seed('Notification', [
    { id: 'n-1', userId: 'stu-1', type: 'announcement', title: 'Exam week', body: 'Exams start Monday', category: 'important', announcementId: 'ann-1', readAt: D('2024-05-10'), acknowledgedAt: D('2024-05-10'), createdAt: D('2024-05-10') },
    { id: 'n-2', userId: 'stu-2', type: 'announcement', title: 'Exam week', body: 'Exams start Monday', category: 'important', announcementId: 'ann-1', readAt: D('2024-05-10'), acknowledgedAt: null, createdAt: D('2024-05-10') },
    { id: 'n-3', userId: 'inst-1', type: 'announcement', title: 'Exam week', body: 'Exams start Monday', category: 'important', announcementId: 'ann-1', readAt: null, acknowledgedAt: null, createdAt: D('2024-05-10') },
  ]);

  __setTestSession(STU1);
  const forbidden = await GET(new NextRequest('http://localhost/api/admin/announcements/ann-1/receipts'), {
    params: Promise.resolve({ id: 'ann-1' }),
  });
  assert.equal(forbidden.status, 403);

  __setTestSession(ADMIN);
  const ghost = await GET(new NextRequest('http://localhost/api/admin/announcements/ghost/receipts'), {
    params: Promise.resolve({ id: 'ghost' }),
  });
  assert.equal(ghost.status, 404);

  const res = await GET(new NextRequest('http://localhost/api/admin/announcements/ann-1/receipts'), {
    params: Promise.resolve({ id: 'ann-1' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.announcement.title, 'Exam week');
  assert.equal(body.total, 3);
  assert.equal(body.read, 2);
  assert.equal(body.acknowledged, 1);
  assert.deepEqual(
    body.recipients.map((r: { userId: string }) => r.userId),
    ['stu-1', 'stu-2', 'inst-1'],
  );
  assert.equal(body.recipients[0].email, 'ali@example.com');
  assert.equal(body.recipients[2].readAt, null);
});

// ---------------------------------------------------------------------------
// Admin user search (Phase 7, Fix 5): role filter
// ---------------------------------------------------------------------------

test('admin user search: role filter returns instructors/admins when asked (default stays students-only)', async () => {
  const { GET } = await import('../app/api/admin/users/route');
  // A teacher+admin: primary role 'admin' with the isTeacher flag —
  // a primary-role filter would miss them from the instructor list.
  fake.seed('User', [
    { id: 'admin-2', name: 'Zara Admin', email: 'zara@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', isAdmin: true, isTeacher: true, status: 'active', joinedAt: D('2024-01-05') },
  ]);

  __setTestSession(ADMIN);
  const get = async (url: string) => {
    const res = await GET(new NextRequest(url));
    assert.equal(res.status, 200, url);
    return (await res.json()) as { users: { id: string; name: string; role: string }[]; total: number };
  };

  // Default (no role): students only.
  const def = await get('http://localhost/api/admin/users?search=a');
  assert.ok(def.users.length > 0, 'expected some students');
  assert.ok(def.users.every((u) => u.role === 'student'), JSON.stringify(def.users));
  assert.deepEqual(def.users.map((u) => u.id).sort(), ['stu-1', 'stu-2']);

  // role=all: students + instructors + admins matching the search.
  const all = await get('http://localhost/api/admin/users?search=a&role=all');
  assert.deepEqual(all.users.map((u) => u.id).sort(), ['admin-1', 'admin-2', 'inst-1', 'stu-1', 'stu-2']);

  // role=instructor: the instructor plus the teacher+admin.
  const inst = await get('http://localhost/api/admin/users?role=instructor');
  assert.deepEqual(inst.users.map((u) => u.id).sort(), ['admin-2', 'inst-1']);

  // role=admin: both admins.
  const adm = await get('http://localhost/api/admin/users?role=admin');
  assert.deepEqual(adm.users.map((u) => u.id).sort(), ['admin-1', 'admin-2']);

  // role=admin with a search narrows to matching admins only.
  const admSearch = await get('http://localhost/api/admin/users?role=admin&search=zara');
  assert.deepEqual(admSearch.users.map((u) => u.id), ['admin-2']);

  // Unknown role falls back to students-only.
  const weird = await get('http://localhost/api/admin/users?role=superuser');
  assert.ok(weird.users.every((u) => u.role === 'student'), JSON.stringify(weird.users));

  // Non-admins and signed-out users still get 403 / 401.
  __setTestSession(STU1);
  assert.equal((await GET(new NextRequest('http://localhost/api/admin/users?role=all'))).status, 403);
  __setTestSession(null);
  assert.equal((await GET(new NextRequest('http://localhost/api/admin/users?role=all'))).status, 401);
});

// ---------------------------------------------------------------------------
// Support requests: scoping, course validation, status transitions
// ---------------------------------------------------------------------------

test('support-request create is scoped to the session student; another student sees nothing', async () => {
  const { POST, GET } = await import('../app/api/student/requests/route');

  __setTestSession(STU1);
  const form = new FormData();
  form.append('category', 'course_issues');
  form.append('subject', 'Video will not play');
  form.append('message', 'Lesson 3 video buffers forever.');
  form.append('courseId', 'course-1');
  form.append('studentId', 'stu-2'); // must be ignored — never from the body
  const created = await POST(formReq('http://localhost/api/student/requests', form));
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.request.studentId, 'stu-1');
  assert.equal(createdBody.request.status, 'new');
  assert.equal(createdBody.request.category, 'course_issues');

  // stu-2 cannot see it (list + direct lookup).
  __setTestSession(STU2);
  const list = await GET(new NextRequest('http://localhost/api/student/requests'));
  assert.equal((await list.json()).total, 0);
  assert.equal(await getSupportRequestForStudent('stu-2', createdBody.request.id), null);
  assert.equal((await listSupportRequestsForStudent('stu-1', {})).total, 1);

  // stu-2 cannot attach a request to a course they are not enrolled in.
  const badCourse = new FormData();
  badCourse.append('category', 'course_issues');
  badCourse.append('subject', 'Not my course');
  badCourse.append('message', 'Trying to file against Web 101.');
  badCourse.append('courseId', 'course-1');
  const rejected = await POST(formReq('http://localhost/api/student/requests', badCourse));
  assert.equal(rejected.status, 400);

  // Bad category is 400 too.
  const badCategory = new FormData();
  badCategory.append('category', 'not_a_category');
  badCategory.append('subject', 'x');
  badCategory.append('message', 'y');
  assert.equal((await POST(formReq('http://localhost/api/student/requests', badCategory))).status, 400);
});

test('support-request status transitions stamp/clear resolution and notify the student', async () => {
  const created = await createSupportRequestService(STU1, {
    category: 'technical_problems',
    subject: 'Login loop',
    message: 'I keep getting signed out.',
  });
  assert.ok(!('error' in created), JSON.stringify(created));
  const id = created.request.id;

  // Filing notified the admins (support_request event).
  const adminNotes = await listNotificationsForUser('admin-1', { type: 'support_request' });
  assert.equal(adminNotes.total, 1);
  assert.match(adminNotes.items[0].title, /Login loop/);

  // Admin moves it to resolved with a reply.
  const resolved = await updateSupportRequestService(ADMIN, id, {
    status: 'resolved',
    adminReply: 'Fixed — please try again.',
  });
  assert.ok(!('error' in resolved), JSON.stringify(resolved));
  assert.equal(resolved.request.status, 'resolved');
  assert.equal(resolved.request.resolvedBy, 'admin-1');
  assert.ok(resolved.request.resolvedAt, 'resolvedAt must be set');
  assert.equal(resolved.request.adminReply, 'Fixed — please try again.');

  // The student was notified of the update.
  const studentNotes = await listNotificationsForUser('stu-1', { type: 'request_update' });
  assert.equal(studentNotes.total, 1);
  assert.match(studentNotes.items[0].body, /resolved/);
  assert.match(studentNotes.items[0].body, /Fixed — please try again/);

  // Reopening clears the resolution stamp.
  const reopened = await updateSupportRequestService(ADMIN, id, { status: 'in_progress' });
  assert.ok(!('error' in reopened), JSON.stringify(reopened));
  assert.equal(reopened.request.status, 'in_progress');
  assert.equal(reopened.request.resolvedBy, undefined);
  assert.equal(reopened.request.resolvedAt, undefined);

  // Invalid status and missing request are rejected.
  const badStatus = await updateSupportRequestService(ADMIN, id, { status: 'done' });
  assert.ok('error' in badStatus && badStatus.status === 400, JSON.stringify(badStatus));
  const ghost = await updateSupportRequestService(ADMIN, 'ghost', { status: 'resolved' });
  assert.ok('error' in ghost && ghost.status === 404, JSON.stringify(ghost));

  // A student cannot triage.
  const studentTriage = await updateSupportRequestService(STU1, id, { status: 'resolved' });
  assert.ok('error' in studentTriage && studentTriage.status === 403, JSON.stringify(studentTriage));

  // Admin list + detail round-trip.
  const { GET: adminList } = await import('../app/api/admin/requests/route');
  const { GET: adminDetail, PATCH } = await import('../app/api/admin/requests/[id]/route');
  __setTestSession(ADMIN);
  const list = await adminList(
    new NextRequest('http://localhost/api/admin/requests?status=in_progress'),
  );
  assert.equal((await list.json()).total, 1);
  const empty = await adminList(
    new NextRequest('http://localhost/api/admin/requests?status=resolved'),
  );
  assert.equal((await empty.json()).total, 0);
  const detail = await adminDetail(new NextRequest(`http://localhost/api/admin/requests/${id}`), {
    params: Promise.resolve({ id }),
  });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).request.subject, 'Login loop');
  const patched = await PATCH(
    jsonReq(`http://localhost/api/admin/requests/${id}`, 'PATCH', { status: 'rejected' }),
    { params: Promise.resolve({ id }) },
  );
  assert.equal(patched.status, 200);
  assert.equal((await patched.json()).request.status, 'rejected');
  assert.equal((await getSupportRequestById(id))?.resolvedBy, 'admin-1');
});

// ---------------------------------------------------------------------------
// Attachment validation
// ---------------------------------------------------------------------------

function mockStorageClient(): SupabaseClient {
  const calls: { bucket: string; path?: string; body?: unknown }[] = [];
  const client = {
    __calls: calls,
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: unknown) => {
          calls.push({ bucket, path, body });
          return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
        },
        createSignedUrl: async (path: string, expiresIn: number) => ({
          data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=x` },
          error: null,
        }),
      }),
    },
  };
  return client as unknown as SupabaseClient;
}

test('attachment validation: wrong type and oversize are rejected before any upload; a good PDF uploads to application-files', async () => {
  const client = mockStorageClient();
  const calls = (client as unknown as { __calls: { bucket: string }[] }).__calls;

  // Wrong type — rejected without touching storage.
  await assert.rejects(
    uploadSupportRequestAttachment(
      { name: 'notes.txt', type: 'text/plain', size: 10, arrayBuffer: new TextEncoder().encode('hello').buffer as ArrayBuffer },
      client,
    ),
    /Only PDF, DOC, DOCX, JPG or PNG/,
  );
  assert.equal(calls.length, 0);

  // Oversize — rejected without touching storage.
  await assert.rejects(
    uploadSupportRequestAttachment(
      { name: 'big.pdf', type: 'application/pdf', size: 6 * 1024 * 1024, arrayBuffer: new TextEncoder().encode('x').buffer as ArrayBuffer },
      client,
    ),
    /5 MB or smaller/,
  );
  assert.equal(calls.length, 0);

  // A good PDF uploads into the private application-files bucket.
  const pdf = new TextEncoder().encode('%PDF-1.4 fake').buffer as ArrayBuffer;
  const result = await uploadSupportRequestAttachment(
    { name: 'shot.pdf', type: 'application/pdf', size: pdf.byteLength, arrayBuffer: pdf },
    client,
  );
  assert.match(result.path, /^support-requests\/[0-9a-f-]+\.pdf$/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bucket, APPLICATION_FILES_BUCKET);

  // The standalone upload route rejects a bad file with 400 and a
  // good file without a service-role key with 503.
  const { POST: uploadRoute } = await import('../app/api/student/requests/upload/route');
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    __setTestSession(STU1);
    const txt = new FormData();
    txt.append('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    assert.equal(
      (await uploadRoute(new NextRequest('http://localhost/api/student/requests/upload', { method: 'POST', body: txt }))).status,
      400,
    );
    const good = new FormData();
    good.append('file', new File(['%PDF-1.4'], 'shot.pdf', { type: 'application/pdf' }));
    assert.equal(
      (await uploadRoute(new NextRequest('http://localhost/api/student/requests/upload', { method: 'POST', body: good }))).status,
      503,
    );
  } finally {
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  }
});
