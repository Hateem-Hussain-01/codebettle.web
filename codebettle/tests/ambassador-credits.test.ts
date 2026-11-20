/**
 * Ambassador credit system (Eman, 20 Nov 2026).
 *
 * - The code IS a coupon: Rs 200 off per enrollment, fixed type,
 *   created/repaired by ensureAmbassadorCoupon; a drifted coupon is
 *   repaired, a changed-away/deactivated code's coupon is deactivated.
 * - 100 credits per referred student, awarded on the referred
 *   student's FIRST enrollment, exactly once — one student enrolling
 *   in five courses still earns 100, once. Ledger-based (append-only),
 *   idempotent via (kind, referenceId=userId).
 * - The referred student gets Rs 200 off server-side at enrollment
 *   creation (resolveAmbassadorCouponForStudent + the enrollment
 *   service auto-set) — never a client value.
 *
 * Repo/service tests run against the fake DB; wiring is asserted by
 * source inspection, following the Phase 6 design-test pattern.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  countAmbassadorDiscounts,
  deactivateAmbassadorCoupon,
  ensureAmbassadorCoupon,
  ensureAmbassadorCouponsForAll,
  getAmbassadorCreditBalance,
  getAmbassadorCreditBalances,
  getAmbassadorCreditSummary,
  listAmbassadorCreditLedgerForAmbassador,
  maybeAwardAmbassadorCreditsForEnrollment,
  resolveAmbassadorCouponForStudent,
} from '../lib/db/ambassador-credits';
import {
  attributeSignupToAmbassador,
  createAmbassador,
  updateAmbassadorCode,
  updateAmbassadorStatus,
  validateReferralCodeForAssignment,
} from '../lib/db/ambassadors';
import { getCouponByCode } from '../lib/db/coupons';
import { AMBASSADOR_CREDITS_PER_REFERRAL, AMBASSADOR_REFERRAL_DISCOUNT_PKR } from '../lib/referral';

const D = (s: string) => new Date(s);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

let fake: FakeDb;

function reset() {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
}

test.beforeEach(() => reset());
test.afterEach(() => __resetDbClient());

function seedUsers() {
  fake.seed('User', [
    { id: 'amb-user-a', name: 'Ayesha', email: 'ayesha@example.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2026-01-01') },
    { id: 'user-b', name: 'Bilal', email: 'bilal@example.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2026-02-01') },
    { id: 'user-c', name: 'Chanda', email: 'chanda@example.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2026-03-01') },
  ]);
}

async function seedAmbassadorA() {
  // Eman's own code, fixed here so the coupon/award tests are deterministic.
  return createAmbassador({ email: 'ayesha@example.com', userId: 'amb-user-a', referralCode: 'FG2SZU' });
}

function seedEnrollment(id: string, studentId: string, courseId = 'course-1', couponUsed: string | null = null) {
  fake.seed('Enrollment', [
    { id, studentId, courseId, batchId: null, enrolledAt: D('2026-02-02'), isCompleted: false, completedAt: null, paymentStatus: 'pending', amountPaid: 0, couponUsed, deletedAt: null },
  ]);
}

// ---------------------------------------------------------------------------
// The code IS a Rs 200 coupon
// ---------------------------------------------------------------------------

test('ensureAmbassadorCoupon creates the canonical fixed Rs 200 coupon, idempotently', async () => {
  const first = await ensureAmbassadorCoupon('FG2SZU');
  assert.ok(first);
  assert.equal(first.code, 'FG2SZU');
  assert.equal(first.type, 'fixed');
  assert.equal(first.value, AMBASSADOR_REFERRAL_DISCOUNT_PKR);
  assert.equal(first.value, 200);
  assert.equal(first.isActive, true);
  assert.deepEqual(first.applicableCourses, []);
  assert.ok(new Date(first.expiresAt).getTime() > Date.now());
  // Second call repairs nothing and creates no duplicate.
  const second = await ensureAmbassadorCoupon('fg2szu');
  assert.equal(second?.id, first.id);
  assert.equal((await getCouponByCode('FG2SZU'))?.id, first.id);
});

test('ensureAmbassadorCoupon repairs a drifted coupon (wrong type/value, deactivated, expired)', async () => {
  fake.seed('Coupon', [
    { id: 'cp-1', code: 'FG2SZU', type: 'percentage', value: 50, maxUses: 10, usedCount: 3, expiresAt: D('2020-01-01'), isActive: false, applicableCourses: ['course-9'], createdAt: D('2026-01-01'), updatedAt: D('2026-01-01') },
  ]);
  const repaired = await ensureAmbassadorCoupon('FG2SZU');
  assert.ok(repaired);
  assert.equal(repaired.type, 'fixed');
  assert.equal(repaired.value, 200);
  assert.equal(repaired.isActive, true);
  assert.deepEqual(repaired.applicableCourses, []);
  assert.ok(new Date(repaired.expiresAt).getTime() > Date.now());
  assert.equal(repaired.usedCount, 3, 'repair keeps the usage count');
});

test('deactivateAmbassadorCoupon deactivates; the backfill syncs every code', async () => {
  await ensureAmbassadorCoupon('FG2SZU');
  await ensureAmbassadorCoupon('U5W5GK');
  await deactivateAmbassadorCoupon('FG2SZU');
  assert.equal((await getCouponByCode('FG2SZU'))?.isActive, false);
  assert.equal((await getCouponByCode('U5W5GK'))?.isActive, true);
  // Backfill repairs the deactivated one and leaves the good one alone.
  const synced = await ensureAmbassadorCouponsForAll(['FG2SZU', 'U5W5GK']);
  assert.equal(synced, 1);
  assert.equal((await getCouponByCode('FG2SZU'))?.isActive, true);
});

// ---------------------------------------------------------------------------
// 100 credits per referred student, exactly once
// ---------------------------------------------------------------------------

test('first enrollment awards 100 credits; a second call awards nothing', async () => {
  seedUsers();
  const ambassador = await seedAmbassadorA();
  assert.equal(await attributeSignupToAmbassador(ambassador.id, 'user-b'), true);
  seedEnrollment('enr-1', 'user-b');
  assert.equal(await maybeAwardAmbassadorCreditsForEnrollment('enr-1'), true);
  assert.equal(await getAmbassadorCreditBalance(ambassador.id), AMBASSADOR_CREDITS_PER_REFERRAL);
  assert.equal(await getAmbassadorCreditBalance(ambassador.id), 100);
  // Same enrollment again: nothing.
  assert.equal(await maybeAwardAmbassadorCreditsForEnrollment('enr-1'), false);
  assert.equal(await getAmbassadorCreditBalance(ambassador.id), 100);
  const ledger = await listAmbassadorCreditLedgerForAmbassador(ambassador.id);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].kind, 'earn');
  assert.equal(ledger[0].amount, 100);
  assert.equal(ledger[0].referenceId, 'user-b');
});

test('one student, five courses: still exactly 100 credits, once', async () => {
  seedUsers();
  const ambassador = await seedAmbassadorA();
  assert.equal(await attributeSignupToAmbassador(ambassador.id, 'user-b'), true);
  seedEnrollment('enr-1', 'user-b', 'course-1');
  seedEnrollment('enr-2', 'user-b', 'course-2');
  seedEnrollment('enr-3', 'user-b', 'course-3');
  assert.equal(await maybeAwardAmbassadorCreditsForEnrollment('enr-1'), true);
  assert.equal(await maybeAwardAmbassadorCreditsForEnrollment('enr-2'), false);
  assert.equal(await maybeAwardAmbassadorCreditsForEnrollment('enr-3'), false);
  assert.equal(await getAmbassadorCreditBalance(ambassador.id), 100);
});

test('no attribution, no award; inactive ambassador, no award; unknown enrollment, no award', async () => {
  seedUsers();
  const ambassador = await seedAmbassadorA();
  // user-c never joined with the code.
  seedEnrollment('enr-1', 'user-c');
  assert.equal(await maybeAwardAmbassadorCreditsForEnrollment('enr-1'), false);
  assert.equal(await getAmbassadorCreditBalance(ambassador.id), 0);
  // user-b attributed, but the ambassador is deactivated first.
  assert.equal(await attributeSignupToAmbassador(ambassador.id, 'user-b'), true);
  seedEnrollment('enr-2', 'user-b');
  await updateAmbassadorStatus(ambassador.id, 'inactive');
  assert.equal(await maybeAwardAmbassadorCreditsForEnrollment('enr-2'), false);
  assert.equal(await getAmbassadorCreditBalance(ambassador.id), 0);
  // Unknown enrollment id.
  assert.equal(await maybeAwardAmbassadorCreditsForEnrollment('no-such-enrollment'), false);
});

test('balances + summary read the ledger (two referred students = 200)', async () => {
  seedUsers();
  const ambassador = await seedAmbassadorA();
  assert.equal(await attributeSignupToAmbassador(ambassador.id, 'user-b'), true);
  assert.equal(await attributeSignupToAmbassador(ambassador.id, 'user-c'), true);
  seedEnrollment('enr-1', 'user-b');
  seedEnrollment('enr-2', 'user-c');
  assert.equal(await maybeAwardAmbassadorCreditsForEnrollment('enr-1'), true);
  assert.equal(await maybeAwardAmbassadorCreditsForEnrollment('enr-2'), true);
  assert.deepEqual(await getAmbassadorCreditSummary(ambassador.id), { balance: 200, earned: 200 });
  const balances = await getAmbassadorCreditBalances([ambassador.id, 'no-such-ambassador']);
  assert.equal(balances.get(ambassador.id), 200);
  assert.equal(balances.get('no-such-ambassador'), 0);
});

// ---------------------------------------------------------------------------
// The referred student gets Rs 200 off, server-side
// ---------------------------------------------------------------------------

test('resolveAmbassadorCouponForStudent returns the code only for an attributed student with a live coupon', async () => {
  seedUsers();
  const ambassador = await seedAmbassadorA();
  await ensureAmbassadorCoupon('FG2SZU');
  assert.equal(await attributeSignupToAmbassador(ambassador.id, 'user-b'), true);
  assert.equal(await resolveAmbassadorCouponForStudent('user-b', 'course-1'), 'FG2SZU');
  // No attribution: nothing.
  assert.equal(await resolveAmbassadorCouponForStudent('user-c', 'course-1'), null);
  // Coupon deactivated: nothing.
  await deactivateAmbassadorCoupon('FG2SZU');
  assert.equal(await resolveAmbassadorCouponForStudent('user-b', 'course-1'), null);
  await ensureAmbassadorCoupon('FG2SZU');
  // Ambassador deactivated: nothing.
  await updateAmbassadorStatus(ambassador.id, 'inactive');
  assert.equal(await resolveAmbassadorCouponForStudent('user-b', 'course-1'), null);
});

test('countAmbassadorDiscounts counts enrollments by couponUsed, unknown codes read 0', async () => {
  seedEnrollment('enr-1', 'user-b', 'course-1', 'FG2SZU');
  seedEnrollment('enr-2', 'user-c', 'course-1', 'FG2SZU');
  seedEnrollment('enr-3', 'user-b', 'course-2', 'U5W5GK');
  seedEnrollment('enr-4', 'user-c', 'course-2', null);
  const counts = await countAmbassadorDiscounts(['FG2SZU', 'U5W5GK', 'ZZZZZZ']);
  assert.equal(counts.get('FG2SZU'), 2);
  assert.equal(counts.get('U5W5GK'), 1);
  assert.equal(counts.get('ZZZZZZ'), 0);
});

// ---------------------------------------------------------------------------
// Admin-assigned codes: validation + change
// ---------------------------------------------------------------------------

test('validateReferralCodeForAssignment: free code passes; bad format, ambassador and team collisions fail', async () => {
  seedUsers();
  await seedAmbassadorA();
  assert.equal(await validateReferralCodeForAssignment('K7M2PQ'), null);
  assert.equal(await validateReferralCodeForAssignment('fg2szu'), 'This code is already assigned to another ambassador');
  assert.ok((await validateReferralCodeForAssignment('ABC'))?.includes('exactly 6 characters'));
  assert.ok((await validateReferralCodeForAssignment('ABCDE0'))?.includes('exactly 6 characters'));
  // A team member's code collides too.
  fake.seed('TeamReferralCode', [{ id: 'team-code-1', code: 'TM2345', teamAccessId: 'team-1', createdAt: D('2026-01-01'), updatedAt: D('2026-01-01') }]);
  assert.equal(await validateReferralCodeForAssignment('TM2345'), 'This code is already assigned to a team member');
});

test('updateAmbassadorCode changes the code (validated); the old code is then free', async () => {
  seedUsers();
  const ambassador = await seedAmbassadorA();
  const updated = await updateAmbassadorCode(ambassador.id, 'K7M2PQ');
  assert.equal(updated?.referralCode, 'K7M2PQ');
  assert.equal(await validateReferralCodeForAssignment('FG2SZU'), null);
  assert.equal(await validateReferralCodeForAssignment('K7M2PQ'), 'This code is already assigned to another ambassador');
  // The ambassador's own current code is allowed when re-saving.
  assert.equal(await validateReferralCodeForAssignment('K7M2PQ', ambassador.id), null);
  await assert.rejects(updateAmbassadorCode(ambassador.id, 'BAD'), /exactly 6 characters/);
});

// ---------------------------------------------------------------------------
// Wiring (source inspection, Phase 6 design-test pattern)
// ---------------------------------------------------------------------------

test('wiring: enrollment creation auto-sets the ambassador coupon and awards credits', () => {
  const service = read('lib/services/enrollment-service.ts');
  assert.ok(service.includes('resolveAmbassadorCouponForStudent'), 'coupon auto-set at enrollment creation');
  assert.ok(service.includes('maybeAwardAmbassadorCreditsForEnrollment'), 'credits awarded after enrollment creation');
  assert.ok(service.includes('couponUsed'), 'the auto-set writes couponUsed');
});

test('wiring: the 33rd admin area Referral Codes exists and lists codes with credits + discounts', () => {
  const access = read('lib/admin-access.ts');
  assert.ok(access.includes("'referral-codes'"), 'referral-codes area key');
  assert.ok(access.includes("href: '/admin/referral-codes'"), 'referral-codes href');
  const page = read('app/admin/referral-codes/page.tsx');
  assert.ok(page.includes('listAmbassadorsWithStats'));
  assert.ok(page.includes('ensureAmbassadorCouponsForAll'));
  assert.ok(page.includes('getAmbassadorCreditBalances'));
  assert.ok(page.includes('countAmbassadorDiscounts'));
  const client = read('app/admin/referral-codes/referral-codes-client.tsx');
  assert.ok(client.includes('Assign a code'));
  assert.ok(client.includes('Change code'));
  assert.ok(client.includes('Deactivate'));
});

test('wiring: the ambassador dashboard shows the code + My Credits, no link, no clicks', () => {
  const client = read('app/student/ambassador/ambassador-dashboard-client.tsx');
  assert.ok(client.includes('My Credits'));
  assert.ok(client.includes('creditBalance'));
  assert.ok(!client.includes('referralLink'), 'no referral link is shown');
  assert.ok(!client.includes('stats.clicks'), 'no clicks stat');
  const page = read('app/student/ambassador/page.tsx');
  assert.ok(page.includes('getAmbassadorCreditSummary'));
});
