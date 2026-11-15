import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { getAuditLog } from '../lib/db/audit';
import { getEnrollmentById, updateEnrollment } from '../lib/db/enrollments';
import { createPaymentAccount } from '../lib/db/payment-accounts';
import { createPaymentSubmission } from '../lib/db/payments';
import {
  compEnrollmentService,
  createEnrollmentService,
  enrollSelfService,
  updateEnrollmentService,
} from '../lib/services/enrollment-service';
import { reviewPaymentService, submitPaymentService } from '../lib/services/payment-service';
import { listPaymentAccountsService } from '../lib/services/payment-account-service';
import { listSocialLinksService } from '../lib/services/social-link-service';
import type { Actor } from '../lib/services/errors';
import type { SessionUser } from '../lib/services/auth-service';
import type { SupabaseClient } from '@supabase/supabase-js';
import { POST as compEnrollmentRoute } from '../app/api/admin/enrollments/[id]/comp/route';

/**
 * Phase 3 — enrollment & payment security fixes (MEDIUM-B1, P-2,
 * P-3 / MEDIUM-B2, LOW-B1, LOW-B2, U-4).
 *
 * Every test below pins a finding shut: the silent pending→free
 * flip, transaction-ref reuse, the vacuous coupon amount check, the
 * flag-admin capability drop, the flip-to-paid amount override, and
 * the verbatim proofPath. The complimentary-access action
 * (enrollment.comp) is the legitimate replacement for comping.
 */

const D = (s: string) => new Date(s);

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };
const RESTRICTED: Actor = { id: 'restr-1', role: 'admin', name: 'Restra', isAdmin: true };
const FLAG_ADMIN: Actor = { id: 'flag-1', role: 'instructor', name: 'Flag', isAdmin: true };
const PLAIN_INST: Actor = { id: 'inst-1', role: 'instructor', name: 'Usman' };
const STU: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };
const STU2: SessionUser = { id: 'stu-2', name: 'Sara', email: 'sara@example.com', role: 'student' };
const STU3: SessionUser = { id: 'stu-3', name: 'Omar', email: 'omar@example.com', role: 'student' };
const STU4: SessionUser = { id: 'stu-4', name: 'Zain', email: 'zain@example.com', role: 'student' };

const ADMIN_SESSION: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const RESTRICTED_SESSION: SessionUser = {
  id: 'restr-1', name: 'Restra', email: 'restra@codebettle.com', role: 'admin',
  isAdmin: true, adminPermissions: { enrollments: true },
};

let fake: FakeDb;
let accountId: string;

function course(id: string, slug: string, pricePkr: number, isFree: boolean) {
  return {
    id, slug, title: id, description: 'Intro', longDescription: 'Long',
    thumbnail: '/t.png', category: 'Programming', level: 'beginner', pricePkr, isFree,
    instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
    isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
    tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
    createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
  };
}

/** Mock storage client: `existing` is the set of file names in the bucket root. */
function mockStorageClient(existing: string[]): SupabaseClient {
  return {
    storage: {
      from: (_bucket: string) => ({
        list: async (_dir: string, opts?: { search?: string }) => ({
          data: existing
            .filter((n) => !opts?.search || n.includes(opts.search))
            .map((name) => ({ name })),
          error: null,
        }),
      }),
    },
  } as unknown as SupabaseClient;
}

/**
 * Mock storage client reproducing the REAL `payment-proofs` bucket
 * layout (Phase 4 regression): the bucket contains ONE folder named
 * `payment-proofs` — because uploadPaymentProof stores objects at key
 * `payment-proofs/<uuid>.png` — and the files live INSIDE that folder.
 * A root listing therefore returns only the folder entry, never a
 * file name; a listing of the `payment-proofs` folder returns the
 * files. `filesInFolder` is the set of file names inside the folder.
 * `search` narrows by substring, like real Supabase Storage.
 */
function mockRealLayoutStorageClient(filesInFolder: string[]): SupabaseClient {
  return {
    storage: {
      from: (_bucket: string) => ({
        list: async (dir: string, opts?: { search?: string }) => {
          const entries = dir === 'payment-proofs' ? filesInFolder : ['payment-proofs'];
          return {
            data: entries
              .filter((n) => !opts?.search || n.includes(opts.search))
              .map((name) => ({ name })),
            error: null,
          };
        },
      }),
    },
  } as unknown as SupabaseClient;
}

test.beforeEach(async () => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'restr-1', name: 'Restra', email: 'restra@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', isAdmin: true, adminPermissions: { enrollments: true }, status: 'active', joinedAt: D('2024-01-01') },
    { id: 'flag-1', name: 'Flag', email: 'flag@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', isAdmin: true, status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-3', name: 'Omar', email: 'omar@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-4', name: 'Zain', email: 'zain@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
  fake.seed('Course', [
    course('course-1', 'web-101', 5000, false),
    course('course-2', 'py-101', 3000, false),
    course('course-free', 'free-101', 0, true),
  ]);
  fake.seed('Coupon', [
    { id: 'coup-half', code: 'HALF50', type: 'percentage', value: 50, maxUses: 100, usedCount: 0, expiresAt: D('2030-01-01'), isActive: true, createdAt: D('2024-01-01'), applicableCourses: [] },
    { id: 'coup-c2', code: 'COURSE2ONLY', type: 'fixed', value: 1000, maxUses: 100, usedCount: 0, expiresAt: D('2030-01-01'), isActive: true, createdAt: D('2024-01-01'), applicableCourses: ['course-2'] },
    { id: 'coup-old', code: 'EXPIRED', type: 'percentage', value: 50, maxUses: 100, usedCount: 0, expiresAt: D('2020-01-01'), isActive: true, createdAt: D('2024-01-01'), applicableCourses: [] },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'pending', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'pending', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-c2-half', studentId: 'stu-1', courseId: 'course-2', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'pending', amountPaid: 0, couponUsed: 'HALF50', deletedAt: null },
    { id: 'enr-c2-fixed', studentId: 'stu-2', courseId: 'course-2', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'pending', amountPaid: 0, couponUsed: 'COURSE2ONLY', deletedAt: null },
    { id: 'enr-free', studentId: 'stu-1', courseId: 'course-free', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-paid', studentId: 'stu-3', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    // Legacy free enrolment in a PAID course (granted before this fix).
    { id: 'enr-legacy-free', studentId: 'stu-3', courseId: 'course-2', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
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

// ---------------------------------------------------------------------------
// MEDIUM-B1 — pending→free flip + the complimentary-access action
// ---------------------------------------------------------------------------

test('B1: admin create as free on a paid course is rejected', async () => {
  const result = await createEnrollmentService(ADMIN, {
    studentId: 'stu-4', courseId: 'course-2', paymentStatus: 'free', amountPaid: 0,
  });
  assert.ok('error' in result && result.status === 400, JSON.stringify(result));
  assert.match(result.error, /complimentary/);
});

test('B1: admin create as free on a free course still works', async () => {
  const result = await createEnrollmentService(ADMIN, {
    studentId: 'stu-2', courseId: 'course-free', paymentStatus: 'free', amountPaid: 0,
  });
  assert.ok('enrollment' in result, JSON.stringify(result));
  assert.equal(result.enrollment.paymentStatus, 'free');
});

test('B1: pending→free flip is rejected for a paid course, for full and restricted admins', async () => {
  for (const actor of [ADMIN, RESTRICTED]) {
    const result = await updateEnrollmentService(actor, 'enr-1', { paymentStatus: 'free' });
    assert.ok('error' in result && result.status === 400, JSON.stringify(result));
    assert.match(result.error, /complimentary/);
  }
  assert.equal((await getEnrollmentById('enr-1'))?.paymentStatus, 'pending');
});

test('B1: re-saving an enrolment that is already free is not a new grant', async () => {
  const result = await updateEnrollmentService(ADMIN, 'enr-legacy-free', { paymentStatus: 'free' });
  assert.ok('enrollment' in result, JSON.stringify(result));
  assert.equal(result.enrollment.paymentStatus, 'free');
});

test('B1: full admin can comp a pending paid enrolment, with a distinct audited action', async () => {
  const result = await compEnrollmentService(ADMIN, 'enr-1', { reason: 'Scholarship — Amal fellow' });
  assert.ok('enrollment' in result, JSON.stringify(result));
  assert.equal(result.enrollment.paymentStatus, 'free');
  assert.equal(result.enrollment.amountPaid, 0);

  const audit = await getAuditLog();
  const entry = audit.find((e) => e.action === 'enrollment.comp');
  assert.ok(entry, 'expected an enrollment.comp audit entry');
  assert.equal(entry?.entityId, 'enr-1');
  assert.match(entry?.detail ?? '', /Scholarship — Amal fellow/);
});

test('B1: restricted admin cannot comp', async () => {
  const result = await compEnrollmentService(RESTRICTED, 'enr-2', { reason: 'Scholarship' });
  assert.ok('error' in result && result.status === 403, JSON.stringify(result));
  assert.match(result.error, /full admin/);
  assert.equal((await getEnrollmentById('enr-2'))?.paymentStatus, 'pending');
});

test('B1: comp requires a reason, and rejects paid enrolments and free courses', async () => {
  const noReason = await compEnrollmentService(ADMIN, 'enr-2', { reason: '   ' });
  assert.ok('error' in noReason && noReason.status === 400, JSON.stringify(noReason));
  assert.match(noReason.error, /reason is required/);

  const paid = await compEnrollmentService(ADMIN, 'enr-paid', { reason: 'Scholarship' });
  assert.ok('error' in paid && paid.status === 400, JSON.stringify(paid));
  assert.match(paid.error, /Only a pending enrolment/);

  const freeCourse = await compEnrollmentService(ADMIN, 'enr-free', { reason: 'Scholarship' });
  assert.ok('error' in freeCourse && freeCourse.status === 400, JSON.stringify(freeCourse));
  assert.match(freeCourse.error, /Only a pending enrolment/);
});

test('B1: comp route requires a full admin', async () => {
  __setTestSession(RESTRICTED_SESSION);
  const denied = await compEnrollmentRoute(
    jsonReq('http://localhost/api/admin/enrollments/enr-2/comp', 'POST', { reason: 'Scholarship' }),
    { params: Promise.resolve({ id: 'enr-2' }) },
  );
  assert.equal(denied.status, 403);

  __setTestSession(ADMIN_SESSION);
  const ok = await compEnrollmentRoute(
    jsonReq('http://localhost/api/admin/enrollments/enr-2/comp', 'POST', { reason: 'Scholarship' }),
    { params: Promise.resolve({ id: 'enr-2' }) },
  );
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { enrollment: { paymentStatus: string } };
  assert.equal(body.enrollment.paymentStatus, 'free');
});

// ---------------------------------------------------------------------------
// P-2 — transaction-reference reuse
// ---------------------------------------------------------------------------

test('P-2: submit with a transaction ref already used by another enrolment is a 409', async () => {
  const first = await createPaymentSubmission({
    enrollmentId: 'enr-2', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-DUP',
  });
  assert.ok('submission' in first, JSON.stringify(first));

  const second = await submitPaymentService(STU, {
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-DUP',
  });
  assert.ok('error' in second && second.status === 409, JSON.stringify(second));
  assert.match(second.error, /already been used/);
});

test('P-2: approval collides on a ref already used by another enrolment', async () => {
  const a = await createPaymentSubmission({
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-COLLIDE',
  });
  const b = await createPaymentSubmission({
    enrollmentId: 'enr-2', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-COLLIDE',
  });
  assert.ok('submission' in a && 'submission' in b);
  if (!('submission' in a)) return;

  const result = await reviewPaymentService(ADMIN, a.submission.id, { decision: 'approved' });
  assert.ok('error' in result && result.status === 409, JSON.stringify(result));
  assert.match(result.error, /already used/);
  assert.equal((await getEnrollmentById('enr-1'))?.paymentStatus, 'pending');
});

test('P-2: a rejected submission’s ref cannot be reused, even for the same enrolment', async () => {
  const created = await submitPaymentService(STU, {
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-ONCE',
  });
  assert.ok('submission' in created, JSON.stringify(created));
  if (!('submission' in created)) return;
  const rejected = await reviewPaymentService(ADMIN, created.submission.id, { decision: 'rejected' });
  assert.ok('submission' in rejected, JSON.stringify(rejected));

  // The pending block lifts, but the ref is spent: one transaction
  // reference pays for one enrolment, ever.
  const again = await submitPaymentService(STU, {
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-ONCE',
  });
  assert.ok('error' in again && again.status === 409, JSON.stringify(again));
});

// ---------------------------------------------------------------------------
// P-3 / MEDIUM-B2 — server-computed discounted price + coupon applicability
// ---------------------------------------------------------------------------

test('P-3: submit with the exact discounted amount succeeds; any other amount is a 400', async () => {
  // HALF50 on the PKR 3,000 course-2: expected PKR 1,500.
  const ok = await submitPaymentService(STU, {
    enrollmentId: 'enr-c2-half', paymentAccountId: accountId, amountPkr: 1500, transactionRef: 'TXN-HALF-OK',
  });
  assert.ok('submission' in ok, JSON.stringify(ok));

  const low = await submitPaymentService(STU2, {
    enrollmentId: 'enr-c2-fixed', paymentAccountId: accountId, amountPkr: 1, transactionRef: 'TXN-FIXED-LOW',
  });
  assert.ok('error' in low && low.status === 400, JSON.stringify(low));
  assert.match(low.error, /does not match the amount due \(PKR 2000\)/);

  const full = await submitPaymentService(STU2, {
    enrollmentId: 'enr-c2-fixed', paymentAccountId: accountId, amountPkr: 3000, transactionRef: 'TXN-FIXED-FULL',
  });
  assert.ok('error' in full && full.status === 400, JSON.stringify(full));
  assert.match(full.error, /does not match the amount due \(PKR 2000\)/);
});

test('P-3: submit with a wrong amount and no coupon is a 400', async () => {
  const result = await submitPaymentService(STU, {
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 4000, transactionRef: 'TXN-LOW',
  });
  assert.ok('error' in result && result.status === 400, JSON.stringify(result));
  assert.match(result.error, /does not match the amount due \(PKR 5000\)/);
});

test('P-3: a coupon for another course is rejected at self-enrol and at admin create', async () => {
  // stu-4 holds no enrolment yet, so the coupon check — not the
  // duplicate check — decides each call.
  const wrongCourse = await enrollSelfService(STU4, { courseId: 'course-1', couponCode: 'COURSE2ONLY' });
  assert.ok('error' in wrongCourse && wrongCourse.status === 400, JSON.stringify(wrongCourse));
  assert.match(wrongCourse.error, /does not apply to this course/);

  const rightCourse = await enrollSelfService(STU4, { courseId: 'course-2', couponCode: 'COURSE2ONLY' });
  assert.ok('enrollment' in rightCourse, JSON.stringify(rightCourse));
  assert.equal(rightCourse.enrollment.couponUsed, 'COURSE2ONLY');

  const adminWrong = await createEnrollmentService(ADMIN, {
    studentId: 'stu-4', courseId: 'course-1', paymentStatus: 'pending', amountPaid: 0, couponUsed: 'COURSE2ONLY',
  });
  assert.ok('error' in adminWrong && adminWrong.status === 400, JSON.stringify(adminWrong));

  const adminBogus = await createEnrollmentService(ADMIN, {
    studentId: 'stu-4', courseId: 'course-1', paymentStatus: 'pending', amountPaid: 0, couponUsed: 'NOPE',
  });
  assert.ok('error' in adminBogus && adminBogus.status === 400, JSON.stringify(adminBogus));

  const adminOk = await createEnrollmentService(ADMIN, {
    studentId: 'stu-4', courseId: 'course-1', paymentStatus: 'pending', amountPaid: 0, couponUsed: 'HALF50',
  });
  assert.ok('enrollment' in adminOk, JSON.stringify(adminOk));
  assert.equal(adminOk.enrollment.couponUsed, 'HALF50');
});

test('P-3: approval rejects a wrong amount even when the submission got in another way', async () => {
  const created = await createPaymentSubmission({
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 4000, transactionRef: 'TXN-WRONG-AMT',
  });
  assert.ok('submission' in created, JSON.stringify(created));
  if (!('submission' in created)) return;

  const result = await reviewPaymentService(ADMIN, created.submission.id, { decision: 'approved' });
  assert.ok('error' in result && result.status === 400, JSON.stringify(result));
  assert.match(result.error, /does not match the amount due \(PKR 5000\)/);
  assert.equal((await getEnrollmentById('enr-1'))?.paymentStatus, 'pending');
});

test('P-3: approval re-validates the coupon — expired between submit and approval is a 400', async () => {
  const created = await submitPaymentService(STU, {
    enrollmentId: 'enr-c2-half', paymentAccountId: accountId, amountPkr: 1500, transactionRef: 'TXN-EXPIRING',
  });
  assert.ok('submission' in created, JSON.stringify(created));
  if (!('submission' in created)) return;

  // The coupon expires after the student paid but before the admin reviews.
  fake.seed('Coupon', [
    { id: 'coup-half', code: 'HALF50', type: 'percentage', value: 50, maxUses: 100, usedCount: 0, expiresAt: D('2020-01-01'), isActive: true, createdAt: D('2024-01-01'), applicableCourses: [] },
  ]);
  const result = await reviewPaymentService(ADMIN, created.submission.id, { decision: 'approved' });
  assert.ok('error' in result && result.status === 400, JSON.stringify(result));
  assert.match(result.error, /no longer valid/);
  assert.equal((await getEnrollmentById('enr-c2-half'))?.paymentStatus, 'pending');
});

test('P-3: approval succeeds at the exact discounted amount', async () => {
  // COURSE2ONLY (fixed 1,000 off) on the PKR 3,000 course-2: expected PKR 2,000.
  const created = await submitPaymentService(STU2, {
    enrollmentId: 'enr-c2-fixed', paymentAccountId: accountId, amountPkr: 2000, transactionRef: 'TXN-FIXED-OK',
  });
  assert.ok('submission' in created, JSON.stringify(created));
  if (!('submission' in created)) return;

  const result = await reviewPaymentService(ADMIN, created.submission.id, { decision: 'approved' });
  assert.ok('enrollment' in result, JSON.stringify(result));
  assert.equal(result.enrollment.paymentStatus, 'paid');
  assert.equal(result.enrollment.amountPaid, 2000);
});

// ---------------------------------------------------------------------------
// MEDIUM-B2 — flip-to-paid amount must match the approved submission
// ---------------------------------------------------------------------------

test('B2: flip-to-paid with a mismatched amountPaid is rejected; omitted amount uses the approved one', async () => {
  const created = await submitPaymentService(STU, {
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-FLIP',
  });
  assert.ok('submission' in created, JSON.stringify(created));
  if (!('submission' in created)) return;
  const approved = await reviewPaymentService(ADMIN, created.submission.id, { decision: 'approved' });
  assert.ok('enrollment' in approved, JSON.stringify(approved));

  // Approval already flipped it to paid — reset to pending so the
  // manual PATCH flip is exercised (the approved submission stands).
  await updateEnrollment('enr-1', { paymentStatus: 'pending', amountPaid: 0 });

  const mismatch = await updateEnrollmentService(ADMIN, 'enr-1', { paymentStatus: 'paid', amountPaid: 4000 });
  assert.ok('error' in mismatch && mismatch.status === 400, JSON.stringify(mismatch));
  assert.match(mismatch.error, /does not match the approved payment \(PKR 5000\)/);
  assert.equal((await getEnrollmentById('enr-1'))?.paymentStatus, 'pending');

  const ok = await updateEnrollmentService(ADMIN, 'enr-1', { paymentStatus: 'paid' });
  assert.ok('enrollment' in ok, JSON.stringify(ok));
  assert.equal(ok.enrollment.paymentStatus, 'paid');
  assert.equal(ok.enrollment.amountPaid, 5000);
});

// ---------------------------------------------------------------------------
// LOW-B1 — flag-admins keep their capability
// ---------------------------------------------------------------------------

test('LOW-B1: a flag-admin (instructor + isAdmin) can verify payments and manage accounts and social links', async () => {
  const created = await submitPaymentService(STU, {
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-FLAG',
  });
  assert.ok('submission' in created, JSON.stringify(created));
  if (!('submission' in created)) return;

  const reviewed = await reviewPaymentService(FLAG_ADMIN, created.submission.id, { decision: 'approved' });
  assert.ok('enrollment' in reviewed, JSON.stringify(reviewed));
  assert.equal(reviewed.enrollment.paymentStatus, 'paid');

  const accounts = await listPaymentAccountsService(FLAG_ADMIN);
  assert.ok('accounts' in accounts, JSON.stringify(accounts));

  const links = await listSocialLinksService(FLAG_ADMIN);
  assert.ok('links' in links, JSON.stringify(links));
});

test('LOW-B1: a plain instructor (no admin flag) is still denied all three', async () => {
  const created = await submitPaymentService(STU, {
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-FLAG-NO',
  });
  assert.ok('submission' in created, JSON.stringify(created));
  if (!('submission' in created)) return;

  const reviewed = await reviewPaymentService(PLAIN_INST, created.submission.id, { decision: 'approved' });
  assert.ok('error' in reviewed && reviewed.status === 403, JSON.stringify(reviewed));

  const accounts = await listPaymentAccountsService(PLAIN_INST);
  assert.ok('error' in accounts && accounts.status === 403, JSON.stringify(accounts));

  const links = await listSocialLinksService(PLAIN_INST);
  assert.ok('error' in links && links.status === 403, JSON.stringify(links));
});

// ---------------------------------------------------------------------------
// U-4 — proofPath validation
// ---------------------------------------------------------------------------

test('U-4: junk proof paths are rejected', async () => {
  const junk = [
    'not-a-path',
    'avatars/stu-1/x.png',
    'payment-proofs/../../etc/passwd',
    'https://evil.example.com/x.png',
    'payment-proofs/noext',
    'payment-proofs/.png',
    'payment-proofs/x.exe',
    'payment-proofs/sub/dir/x.png',
  ];
  for (let i = 0; i < junk.length; i++) {
    const result = await submitPaymentService(STU, {
      enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000,
      transactionRef: `TXN-JUNK-${i}`, proofPath: junk[i],
    });
    assert.ok('error' in result && result.status === 400, `${junk[i]}: ${JSON.stringify(result)}`);
    assert.match(result.error, /Invalid payment proof path/);
  }
  assert.equal((await getEnrollmentById('enr-1'))?.paymentStatus, 'pending');
});

test('U-4: a proof path that does not exist in the bucket is rejected', async () => {
  const result = await submitPaymentService(STU, {
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-MISSING-PROOF',
    proofPath: 'payment-proofs/11111111-1111-1111-1111-111111111111.png',
    storageClient: mockStorageClient([]),
  });
  assert.ok('error' in result && result.status === 400, JSON.stringify(result));
  assert.match(result.error, /could not be found/);
});

test('U-4: a proof path that exists in the bucket is accepted', async () => {
  const result = await submitPaymentService(STU, {
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-PROOF-OK',
    proofPath: 'payment-proofs/11111111-1111-1111-1111-111111111111.png',
    storageClient: mockStorageClient(['11111111-1111-1111-1111-111111111111.png']),
  });
  assert.ok('submission' in result, JSON.stringify(result));
  assert.equal(result.submission.proofUrl, 'payment-proofs/11111111-1111-1111-1111-111111111111.png');
});

test('U-4: a proof already attached to another enrolment’s submission is rejected', async () => {
  const first = await createPaymentSubmission({
    enrollmentId: 'enr-2', paymentAccountId: accountId, amountPkr: 5000,
    transactionRef: 'TXN-SHARED-PROOF', proofUrl: 'payment-proofs/shared.png',
  });
  assert.ok('submission' in first, JSON.stringify(first));

  const second = await submitPaymentService(STU, {
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-SHARED-PROOF-2',
    proofPath: 'payment-proofs/shared.png',
    storageClient: mockStorageClient(['shared.png']),
  });
  assert.ok('error' in second && second.status === 400, JSON.stringify(second));
  assert.match(second.error, /already been used for another enrolment/);
});

// ---------------------------------------------------------------------------
// U-4 REGRESSION (Phase 4, live 15 Nov 2026): the existence check listed
// the bucket ROOT, but uploadPaymentProof stores objects at key
// `payment-proofs/<uuid>.png` — inside a `payment-proofs/` FOLDER in the
// bucket. The root listing never contains a file name, so every real
// proof was reported missing and every upload→submit flow failed with
// 400 "Payment proof could not be found". These tests pin the real
// bucket layout (root holds only the folder entry) via
// mockRealLayoutStorageClient.
// ---------------------------------------------------------------------------

test('U-4 REGRESSION: a proof that exists inside the payment-proofs folder is accepted', async () => {
  const result = await submitPaymentService(STU, {
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-PROOF-LAYOUT-OK',
    proofPath: 'payment-proofs/11111111-1111-1111-1111-111111111111.png',
    storageClient: mockRealLayoutStorageClient(['11111111-1111-1111-1111-111111111111.png']),
  });
  assert.ok('submission' in result, JSON.stringify(result));
  assert.equal(result.submission.proofUrl, 'payment-proofs/11111111-1111-1111-1111-111111111111.png');
});

test('U-4 REGRESSION: a proof absent from the payment-proofs folder is still rejected', async () => {
  const result = await submitPaymentService(STU, {
    enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000, transactionRef: 'TXN-PROOF-LAYOUT-MISSING',
    proofPath: 'payment-proofs/22222222-2222-2222-2222-222222222222.png',
    storageClient: mockRealLayoutStorageClient([]),
  });
  assert.ok('error' in result && result.status === 400, JSON.stringify(result));
  assert.match(result.error, /could not be found/);
});

test('U-4 REGRESSION: without a service-role key the existence check is skipped, not failed', async () => {
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedUrl2 = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const result = await submitPaymentService(STU, {
      enrollmentId: 'enr-1', paymentAccountId: accountId, amountPkr: 5000,
      transactionRef: 'TXN-PROOF-NO-KEY',
      proofPath: 'payment-proofs/11111111-1111-1111-1111-111111111111.png',
      // No storageClient on purpose: forces getPaymentProofStorageClient(),
      // which must throw (no key) so the check returns 'unavailable' and
      // the submit proceeds on the shape + reuse checks alone.
    });
    assert.ok('submission' in result, JSON.stringify(result));
  } finally {
    if (savedUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedUrl2 !== undefined) process.env.SUPABASE_URL = savedUrl2;
    if (savedKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
});
