import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { getAuditLog } from '../lib/db/audit';
import { getEnrollmentById, updateEnrollment } from '../lib/db/enrollments';
import { listNotificationsForUser } from '../lib/db/notifications';
import { createPaymentAccount } from '../lib/db/payment-accounts';
import { createPaymentSubmission, getPendingSubmissionForEnrollment } from '../lib/db/payments';
import { reviewPaymentService, submitPaymentService } from '../lib/services/payment-service';
import { uploadPaymentProof } from '../lib/services/payment-proof-storage';
import type { SessionUser } from '../lib/services/auth-service';
import { GET as getContent } from '../app/api/student/courses/[id]/content/route';
import { GET as listStudentAccounts } from '../app/api/student/payment-accounts/route';
import { POST as submitPayment } from '../app/api/student/payments/route';
import { GET as listAdminPayments } from '../app/api/admin/payments/route';
import { PATCH as reviewPayment } from '../app/api/admin/payments/[id]/route';
import { PATCH as patchEnrollment } from '../app/api/admin/enrollments/[id]/route';

/**
 * Phase 1b/1c/1d — payment flow tests.
 *
 * 1b: a student submits a payment (duplicate while pending -> 409),
 *     and the student payment-accounts endpoint returns only active
 *     accounts. Proof uploads are validated (bad type -> error) before
 *     any storage client is built.
 * 1c: approve flips the enrolment to paid with amountPaid from the
 *     submission and writes a distinct `payment.approve` audit entry;
 *     reject notifies the student (with the reason) and lifts the
 *     pending block so they can submit again; PATCH-ing an enrolment
 *     to paid without an approved submission is a 400.
 * 1d: the content endpoint returns only the first 2 lessons' URLs for
 *     a pending enrolment (the rest locked, no Zoom) and everything
 *     for a paid one.
 */

const D = (s: string) => new Date(s);
const ZOOM = 'https://zoom.us/j/1234567890';
const REC = (n: number) => `https://drive.google.com/file/d/REC${n}/view`;
const MAT = (n: number) => `https://drive.google.com/file/d/MAT${n}/view`;

const STU: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };
const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };

let fake: FakeDb;
let accountId: string;

test.beforeEach(async () => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: 'Long',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: ZOOM, schedule: null, status: 'published',
      isFeatured: true, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 3, rating: 4.5, reviewCount: 2,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
    {
      id: 'course-free', slug: 'free-101', title: 'Free 101', description: 'Intro', longDescription: 'Long',
      thumbnail: '/t.png', category: 'Programming', level: 'beginner', pricePkr: 0, isFree: true,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Module', [{ id: 'mod-1', courseId: 'course-1', title: 'Basics', position: 1 }]);
  fake.seed('Lesson', [1, 2, 3, 4].map((n) => ({
    id: `les-${n}`, moduleId: 'mod-1', title: `L${n}`, description: `Lesson ${n}`,
    position: n, recordingUrl: REC(n), materials: [{ name: 'Slides', url: MAT(n) }],
    duration: '10m', date: null,
  })));
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'pending', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'pending', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-free', studentId: 'stu-1', courseId: 'course-free', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
  ]);
  const account = await createPaymentAccount({
    label: 'HBL CodeBettle', method: 'bank', accountHolder: 'CodeBettle',
    bankName: 'HBL', accountNumber: '1234567890', displayOrder: 0,
  });
  accountId = account.id;
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

function jsonReq(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function submitForEnr1(amountPkr = 5000, transactionRef = 'TXN-1') {
  return submitPaymentService(STU, {
    enrollmentId: 'enr-1',
    paymentAccountId: accountId,
    amountPkr,
    transactionRef,
    proofPath: 'payment-proofs/abc.png',
  });
}

// ---------------------------------------------------------------------------
// 1b — student submission + duplicate prevention
// ---------------------------------------------------------------------------

test('1b: second submit while one is pending returns 409 (route)', async () => {
  __setTestSession(STU);
  const first = await submitPayment(
    jsonReq('http://localhost/api/student/payments', 'POST', {
      enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000,
      transactionRef: 'TXN-1', proofPath: 'payment-proofs/abc.png',
    }),
  );
  assert.equal(first.status, 201);
  const body = (await first.json()) as { submission: { reviewStatus: string } };
  assert.equal(body.submission.reviewStatus, 'submitted');

  const second = await submitPayment(
    jsonReq('http://localhost/api/student/payments', 'POST', {
      enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000,
      transactionRef: 'TXN-2', proofPath: 'payment-proofs/def.png',
    }),
  );
  assert.equal(second.status, 409);
  const err = (await second.json()) as { error: string };
  assert.match(err.error, /already awaiting review/);
  assert.ok(await getPendingSubmissionForEnrollment('enr-1'));
});

test('1b: a student cannot submit for another student’s enrolment, or for a free/paid enrolment', async () => {
  // Another student's enrolment.
  const other = await submitPaymentService(STU, {
    enrollmentId: 'enr-2', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-1',
  });
  assert.ok('error' in other && other.status === 403);

  // Own enrolment, but the course is free.
  const free = await submitPaymentService(STU, {
    enrollmentId: 'enr-free', paymentAccountId: accountId, amountPkr: 100, transactionRef: 'TXN-1',
  });
  assert.ok('error' in free && free.status === 400);

  // An admin cannot submit at all.
  const admin = await submitPaymentService(ADMIN, {
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-1',
  });
  assert.ok('error' in admin && admin.status === 403);
});

test('1b: student payment-accounts endpoint returns only active accounts, in display order', async () => {
  await createPaymentAccount({
    label: 'Off account', method: 'wallet', accountHolder: 'CodeBettle',
    walletNumber: '03000000000', displayOrder: 0, isActive: false,
  });
  await createPaymentAccount({
    label: 'JazzCash CodeBettle', method: 'jazzcash', accountHolder: 'CodeBettle',
    walletNumber: '03001234567', displayOrder: 1,
  });

  __setTestSession(STU);
  const res = await listStudentAccounts();
  assert.equal(res.status, 200);
  const body = (await res.json()) as { accounts: { id: string; label: string; isActive: boolean }[] };
  assert.deepEqual(body.accounts.map((a) => a.label), ['HBL CodeBettle', 'JazzCash CodeBettle']);
  assert.ok(body.accounts.every((a) => a.isActive));

  // Non-students cannot list them.
  __setTestSession(null);
  assert.equal((await listStudentAccounts()).status, 401);
});

test('1b: proof upload rejects a bad file type before any storage client is built', async () => {
  await assert.rejects(
    uploadPaymentProof({
      name: 'notes.txt', type: 'text/plain', size: 10,
      arrayBuffer: Buffer.from('hello'),
    }),
    /Only PNG, JPEG, WebP images or PDF/,
  );
  await assert.rejects(
    uploadPaymentProof({
      name: 'big.png', type: 'image/png', size: 6 * 1024 * 1024,
      arrayBuffer: Buffer.alloc(6 * 1024 * 1024),
    }),
    /5 MB or smaller/,
  );
});

// ---------------------------------------------------------------------------
// 1c — approve / reject transitions + the enrolment PATCH guard
// ---------------------------------------------------------------------------

test('1c: approve flips the enrolment to paid, sets amountPaid, and writes a payment.approve audit entry', async () => {
  const created = await submitForEnr1();
  assert.ok('submission' in created);
  if (!('submission' in created)) return;

  __setTestSession(ADMIN);
  const res = await reviewPayment(
    jsonReq(`http://localhost/api/admin/payments/${created.submission.id}`, 'PATCH', {
      decision: 'approved', reviewNote: 'Matched bank statement',
    }),
    { params: Promise.resolve({ id: created.submission.id }) },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    submission: { reviewStatus: string; reviewedBy: string };
    enrollment: { paymentStatus: string; amountPaid: number };
  };
  assert.equal(body.submission.reviewStatus, 'approved');
  assert.equal(body.submission.reviewedBy, 'admin-1');
  assert.equal(body.enrollment.paymentStatus, 'paid');
  assert.equal(body.enrollment.amountPaid, 5000);

  // The audit trail names the action and carries reviewedBy / amount /
  // transaction ref / proof — not a silent paymentStatus flip.
  const audit = await getAuditLog();
  const entry = audit.find((e) => e.action === 'payment.approve');
  assert.ok(entry, 'expected a payment.approve audit entry');
  assert.equal(entry?.entity, 'payment-submission');
  assert.equal(entry?.entityId, created.submission.id);
  assert.match(entry?.detail ?? '', /reviewedBy=admin-1/);
  assert.match(entry?.detail ?? '', /amount=5000/);
  assert.match(entry?.detail ?? '', /transactionRef=TXN-1/);
  assert.match(entry?.detail ?? '', /proof=payment-proofs\/abc\.png/);

  // The student is notified.
  const notes = await listNotificationsForUser('stu-1');
  assert.ok(notes.items.some((n) => n.title.includes('Payment confirmed')));
});

test('1c: approve rejects a submitted amount that does not match the course price', async () => {
  const created = await submitForEnr1(4000, 'TXN-LOW');
  assert.ok('submission' in created);
  if (!('submission' in created)) return;

  const result = await reviewPaymentService(ADMIN, created.submission.id, { decision: 'approved' });
  assert.ok('error' in result && result.status === 400);
  assert.match(result.error, /does not match the course price/);
  // Nothing changed: still pending, still unpaid.
  assert.equal((await getEnrollmentById('enr-1'))?.paymentStatus, 'pending');
  assert.equal((await getEnrollmentById('enr-1'))?.amountPaid, 0);
});

test('1c: reject notifies the student with the reason and allows resubmission', async () => {
  const created = await submitForEnr1();
  assert.ok('submission' in created);
  if (!('submission' in created)) return;

  __setTestSession(ADMIN);
  const res = await reviewPayment(
    jsonReq(`http://localhost/api/admin/payments/${created.submission.id}`, 'PATCH', {
      decision: 'rejected', reviewNote: 'No matching transaction found',
    }),
    { params: Promise.resolve({ id: created.submission.id }) },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    submission: { reviewStatus: string; reviewNote: string };
    enrollment: { paymentStatus: string };
  };
  assert.equal(body.submission.reviewStatus, 'rejected');
  assert.equal(body.submission.reviewNote, 'No matching transaction found');
  assert.equal(body.enrollment.paymentStatus, 'pending');

  const audit = await getAuditLog();
  const entry = audit.find((e) => e.action === 'payment.reject');
  assert.ok(entry, 'expected a payment.reject audit entry');
  assert.match(entry?.detail ?? '', /No matching transaction found/);

  const notes = await listNotificationsForUser('stu-1');
  const note = notes.items.find((n) => n.title.includes('Payment not verified'));
  assert.ok(note, 'expected a rejection notification for the student');
  assert.match(note?.body ?? '', /No matching transaction found/);

  // The pending block lifts — the student may submit again.
  const again = await submitForEnr1(5000, 'TXN-2');
  assert.ok('submission' in again);
  assert.equal(await getPendingSubmissionForEnrollment('enr-1') === null, false);

  // And an already-reviewed submission cannot be reviewed twice.
  const reReview = await reviewPaymentService(ADMIN, created.submission.id, { decision: 'approved' });
  assert.ok('error' in reReview && reReview.status === 409);
});

test('1c: admin payments list is pending-first and filterable', async () => {
  const created = await submitForEnr1();
  assert.ok('submission' in created);
  if (!('submission' in created)) return;
  await reviewPaymentService(ADMIN, created.submission.id, { decision: 'rejected' });
  await submitForEnr1(5000, 'TXN-2'); // pending again

  __setTestSession(ADMIN);
  const all = await listAdminPayments(new NextRequest('http://localhost/api/admin/payments'));
  assert.equal(all.status, 200);
  const allBody = (await all.json()) as { submissions: { reviewStatus: string; studentName: string; courseTitle: string }[] };
  assert.equal(allBody.submissions[0].reviewStatus, 'submitted');
  assert.equal(allBody.submissions[0].studentName, 'Ali');
  assert.equal(allBody.submissions[0].courseTitle, 'Web 101');

  const pendingOnly = await listAdminPayments(
    new NextRequest('http://localhost/api/admin/payments?reviewStatus=submitted'),
  );
  const pendingBody = (await pendingOnly.json()) as { submissions: { reviewStatus: string }[] };
  assert.equal(pendingBody.submissions.length, 1);
  assert.equal(pendingBody.submissions[0].reviewStatus, 'submitted');

  // A student cannot open the queue.
  __setTestSession(STU);
  assert.equal(
    (await listAdminPayments(new NextRequest('http://localhost/api/admin/payments'))).status,
    403,
  );
});

test('1c: admin enrolment PATCH to paid without an approved submission returns 400', async () => {
  __setTestSession(ADMIN);
  const res = await patchEnrollment(
    jsonReq('http://localhost/api/admin/enrollments/enr-1', 'PATCH', {
      paymentStatus: 'paid', amountPaid: 0,
    }),
    { params: Promise.resolve({ id: 'enr-1' }) },
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /approved payment submission/);
  assert.equal((await getEnrollmentById('enr-1'))?.paymentStatus, 'pending');

  // Once a submission is approved, the same PATCH succeeds — and when
  // no amount is given it takes the approved submission's amount. (The
  // enrolment is reset to pending first, because approving already
  // flipped it to paid.)
  const created = await submitForEnr1();
  assert.ok('submission' in created);
  if (!('submission' in created)) return;
  await reviewPaymentService(ADMIN, created.submission.id, { decision: 'approved' });
  await updateEnrollment('enr-1', { paymentStatus: 'pending', amountPaid: 0 });
  const ok = await patchEnrollment(
    jsonReq('http://localhost/api/admin/enrollments/enr-1', 'PATCH', { paymentStatus: 'paid' }),
    { params: Promise.resolve({ id: 'enr-1' }) },
  );
  assert.equal(ok.status, 200);
  const okBody = (await ok.json()) as { enrollment: { paymentStatus: string; amountPaid: number } };
  assert.equal(okBody.enrollment.paymentStatus, 'paid');
  assert.equal(okBody.enrollment.amountPaid, 5000);

  // Free courses are unaffected: flipping a free enrolment needs no proof.
  const free = await patchEnrollment(
    jsonReq('http://localhost/api/admin/enrollments/enr-free', 'PATCH', { paymentStatus: 'paid' }),
    { params: Promise.resolve({ id: 'enr-free' }) },
  );
  assert.equal(free.status, 200);
});

// ---------------------------------------------------------------------------
// 1d — pre-verification access: first 2 lessons only
// ---------------------------------------------------------------------------

function contentReq(courseId: string): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://localhost/api/student/courses/${courseId}/content`),
    { params: Promise.resolve({ id: courseId }) },
  ];
}

test('1d: pending enrolment gets only the first 2 lessons’ URLs, the rest locked, no Zoom', async () => {
  __setTestSession(STU);
  const [req, params] = contentReq('course-1');
  const res = await getContent(req, params);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    paymentStatus: string; zoomLink: string;
    lessons: { lessonId: string; recordingUrl: string; materials: { name: string; url: string }[]; locked: boolean }[];
  };
  assert.equal(body.paymentStatus, 'pending');
  assert.equal(body.zoomLink, '');
  assert.equal(body.lessons.length, 4);
  assert.deepEqual(body.lessons.map((l) => l.lessonId), ['les-1', 'les-2', 'les-3', 'les-4']);
  // First two: unlocked, URLs present.
  assert.equal(body.lessons[0].locked, false);
  assert.equal(body.lessons[0].recordingUrl, REC(1));
  assert.deepEqual(body.lessons[0].materials, [{ name: 'Slides', url: MAT(1) }]);
  assert.equal(body.lessons[1].locked, false);
  assert.equal(body.lessons[1].recordingUrl, REC(2));
  // Last two: locked, no URLs anywhere in the payload.
  assert.equal(body.lessons[2].locked, true);
  assert.equal(body.lessons[2].recordingUrl, '');
  assert.deepEqual(body.lessons[2].materials, []);
  assert.equal(body.lessons[3].locked, true);
  assert.equal(body.lessons[3].recordingUrl, '');
  assert.deepEqual(body.lessons[3].materials, []);
  const text = JSON.stringify(body);
  assert.equal(text.includes('REC3'), false);
  assert.equal(text.includes('REC4'), false);
  assert.equal(text.includes('zoom.us'), false);
});

test('1d: paid enrolment gets every lesson’s URL and the Zoom link', async () => {
  const created = await submitForEnr1();
  assert.ok('submission' in created);
  if (!('submission' in created)) return;
  await reviewPaymentService(ADMIN, created.submission.id, { decision: 'approved' });

  __setTestSession(STU);
  const [req, params] = contentReq('course-1');
  const res = await getContent(req, params);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    paymentStatus: string; zoomLink: string;
    lessons: { lessonId: string; recordingUrl: string; locked: boolean }[];
  };
  assert.equal(body.paymentStatus, 'paid');
  assert.equal(body.zoomLink, ZOOM);
  assert.equal(body.lessons.length, 4);
  assert.ok(body.lessons.every((l) => l.locked === false));
  assert.deepEqual(body.lessons.map((l) => l.recordingUrl), [REC(1), REC(2), REC(3), REC(4)]);
});
