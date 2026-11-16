/**
 * Team Credit System (PR B, Eman 16 Nov 2026) — credits live ONLY in
 * the Team Portal, earned ONLY on student referral enrollment.
 *
 * - Referral codes are random 6-char, checked against ambassador
 *   codes too (one code, one referrer).
 * - Attribution at registration (team half of the shared ?ref=).
 * - Credit awards are idempotent (one earn per enrollment, ever) and
 *   honour the admin setting for WHEN the credit is earned.
 * - Redemptions hold credits (no double-spend); approve keeps the
 *   hold, reject releases it. The ledger is append-only — the balance
 *   is SUM(amount), never a stored column.
 * - Every earn rate / goody price reads the live admin setting.
 * - Fail-safe: until Eman runs codebettle-team-credits-migration.sql,
 *   reads return empty and awards/attribution return false.
 *
 * Repo/service tests run against the fake DB; page rendering is
 * asserted by source inspection, following the Phase 6 design-test
 * pattern (tests/phase6-design.test.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { grantTeamAccess, revokeTeamAccess } from '../lib/db/team';
import {
  attributeSignupToTeamMember,
  backfillTeamReferralCodes,
  decideTeamRedemption,
  ensureTeamReferralCode,
  generateUniqueTeamReferralCode,
  getTeamCreditBalance,
  getTeamCreditBalances,
  getTeamCreditSummary,
  getTeamReferralCodeByCode,
  isMissingTeamCreditTableError,
  listTeamCreditLedgerForMember,
  listTeamRedemptionsForMember,
  maybeAwardTeamCreditsForEnrollment,
  requestTeamRedemption,
  resolveTeamReferralForSignup,
  TEAM_CREDIT_TABLE_MISSING_MESSAGE,
} from '../lib/db/team-credits';
import { getTeamCreditSettings, SettingsValidationError, updateSiteSettings } from '../lib/services/settings-service';
import { POST as redeem } from '../app/api/team/credits/redeem/route';
import { POST as saveSettings } from '../app/api/admin/credits/settings/route';
import { POST as decideRedemptionRoute } from '../app/api/admin/credits/redemptions/[id]/route';
import { GET as trackReferral } from '../app/api/referral/track/route';
import type { SessionUser } from '../lib/services/auth-service';

const D = (s: string) => new Date(s);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin', isAdmin: true };
const RESTRICTED: SessionUser = {
  id: 'admin-2', name: 'Restricted', email: 'restricted@codebettle.com', role: 'admin', isAdmin: true,
  adminPermissions: { team: true },
};
const MEMBER: SessionUser = { id: 'member-1', name: 'Maryam', email: 'maryam@codebettle.com', role: 'student' };
const MEMBER2: SessionUser = { id: 'member-2', name: 'Bilal', email: 'bilal@codebettle.com', role: 'student' };
const STUDENT: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function reset() {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  __setTestSession(null);
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: 'x', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'member-1', name: 'Maryam', email: 'maryam@codebettle.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'member-2', name: 'Bilal', email: 'bilal@codebettle.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
    {
      id: 'course-free', slug: 'figma-free', title: 'Figma Free', description: 'Free', longDescription: '',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 0, isFree: true,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
}

function seedEnrollment(id: string, studentId: string, courseId: string, paymentStatus: string) {
  fake.seed('Enrollment', [
    {
      id, studentId, courseId, enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null,
      paymentStatus, amountPaid: paymentStatus === 'paid' ? 5000 : 0, couponUsed: null, deletedAt: null,
    },
  ]);
}

test.beforeEach(reset);
test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ---------------------------------------------------------------------------
// (a) Referral code minting
// ---------------------------------------------------------------------------

test('minting: a team code is 6 chars from the 32-char alphabet, and two members get different codes', async () => {
  const grant1 = await grantTeamAccess({ email: 'maryam@codebettle.com', grantedBy: 'admin-1' });
  const grant2 = await grantTeamAccess({ email: 'bilal@codebettle.com', grantedBy: 'admin-1' });
  const code1 = await ensureTeamReferralCode(grant1.id);
  const code2 = await ensureTeamReferralCode(grant2.id);
  assert.equal(code1.code.length, 6);
  assert.match(code1.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.notEqual(code1.code, code2.code);
  assert.equal(code1.teamAccessId, grant1.id);
});

test('minting: ensure is idempotent — the same member keeps the same code', async () => {
  const grant = await grantTeamAccess({ email: 'maryam@codebettle.com', grantedBy: 'admin-1' });
  const first = await ensureTeamReferralCode(grant.id);
  const second = await ensureTeamReferralCode(grant.id);
  assert.equal(first.id, second.id);
  assert.equal(first.code, second.code);
});

test('minting: a code that an ambassador already holds is skipped (one code, one referrer)', async () => {
  // An ambassador holds AAAAAA. The first random draw spells AAAAAA,
  // the second spells BBBBBB — the team mint must skip the collision.
  fake.seed('Ambassador', [
    { id: 'amb-1', email: 'amb@example.com', referralCode: 'AAAAAA', status: 'active', applicationId: null, userId: null },
  ]);
  const grant = await grantTeamAccess({ email: 'maryam@codebettle.com', grantedBy: 'admin-1' });
  let draws = 0;
  const rand = () => {
    draws += 1;
    // First 6 draws: index 0 ('A'); next 6: index 1 ('B').
    return draws <= 6 ? 0 : 1;
  };
  const code = await generateUniqueTeamReferralCode(rand);
  assert.equal(code, 'BBBBBB');
  const minted = await ensureTeamReferralCode(grant.id, rand);
  assert.notEqual(minted.code, 'AAAAAA');
});

test('minting: backfill gives codes to active grants and skips revoked ones', async () => {
  const grant1 = await grantTeamAccess({ email: 'maryam@codebettle.com', grantedBy: 'admin-1' });
  const grant2 = await grantTeamAccess({ email: 'bilal@codebettle.com', grantedBy: 'admin-1' });
  await revokeTeamAccess('bilal@codebettle.com');
  const created = await backfillTeamReferralCodes();
  assert.equal(created, 1);
  assert.ok(await getTeamReferralCodeByCode((await ensureTeamReferralCode(grant1.id)).code));
  // Re-running the backfill creates nothing (idempotent).
  assert.equal(await backfillTeamReferralCodes(), 0);
});

// ---------------------------------------------------------------------------
// (b) Attribution at registration
// ---------------------------------------------------------------------------

test('attribution: resolve returns the team access id for a valid code, null otherwise', async () => {
  const grant = await grantTeamAccess({ email: 'maryam@codebettle.com', grantedBy: 'admin-1' });
  const code = await ensureTeamReferralCode(grant.id);
  assert.equal(await resolveTeamReferralForSignup(code.code, 'ali@example.com'), grant.id);
  assert.equal(await resolveTeamReferralForSignup('ZZZZZZ', 'ali@example.com'), null);
  // Self-referral: the member's own email never attributes.
  assert.equal(await resolveTeamReferralForSignup(code.code, 'maryam@codebettle.com'), null);
  // A revoked grant's code never attributes.
  await revokeTeamAccess('maryam@codebettle.com');
  assert.equal(await resolveTeamReferralForSignup(code.code, 'ali@example.com'), null);
});

test('attribution: one user, one referrer — second attribution refused, ambassador wins', async () => {
  const grant = await grantTeamAccess({ email: 'maryam@codebettle.com', grantedBy: 'admin-1' });
  assert.equal(await attributeSignupToTeamMember(grant.id, 'stu-1'), true);
  assert.equal(await attributeSignupToTeamMember(grant.id, 'stu-1'), false);
  // An ambassador attribution for the same user blocks a team one.
  fake.seed('ReferralAttribution', [{ id: 'ra-1', ambassadorId: 'amb-1', userId: 'stu-2' }]);
  assert.equal(await attributeSignupToTeamMember(grant.id, 'stu-2'), false);
});

test('attribution: a team code landing validates at /api/referral/track (cookie is set)', async () => {
  const grant = await grantTeamAccess({ email: 'maryam@codebettle.com', grantedBy: 'admin-1' });
  const code = await ensureTeamReferralCode(grant.id);
  const ok = await trackReferral(new NextRequest(`http://localhost/api/referral/track?code=${code.code}`));
  assert.deepEqual(await ok.json(), { valid: true });
  const bad = await trackReferral(new NextRequest('http://localhost/api/referral/track?code=ZZZZZZ'));
  assert.deepEqual(await bad.json(), { valid: false });
});

// ---------------------------------------------------------------------------
// (c) Credit awards — idempotent, setting-driven
// ---------------------------------------------------------------------------

async function setupReferredStudent(paymentStatus = 'pending', courseId = 'course-1') {
  const grant = await grantTeamAccess({ email: 'maryam@codebettle.com', grantedBy: 'admin-1' });
  await ensureTeamReferralCode(grant.id);
  await attributeSignupToTeamMember(grant.id, 'stu-1');
  seedEnrollment('enr-1', 'stu-1', courseId, paymentStatus);
  return grant;
}

test('award: enrollment trigger awards the default 10 credits, exactly once', async () => {
  const grant = await setupReferredStudent('pending');
  assert.equal(await maybeAwardTeamCreditsForEnrollment('enr-1', 'enrollment'), true);
  assert.equal(await getTeamCreditBalance(grant.id), 10);
  // Second call (re-processed enrollment) awards nothing.
  assert.equal(await maybeAwardTeamCreditsForEnrollment('enr-1', 'enrollment'), false);
  const entries = await listTeamCreditLedgerForMember(grant.id);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'earn');
  assert.equal(entries[0].amount, 10);
  assert.equal(entries[0].referenceId, 'enr-1');
  assert.match(entries[0].note ?? '', /Ali enrolled in Web 101/);
});

test('award: no attribution means no award; no enrollment means no award', async () => {
  seedEnrollment('enr-9', 'stu-1', 'course-1', 'pending');
  assert.equal(await maybeAwardTeamCreditsForEnrollment('enr-9', 'enrollment'), false);
  assert.equal(await maybeAwardTeamCreditsForEnrollment('no-such-enrollment', 'enrollment'), false);
});

test('award: earn-on-approved-payment waits for the payment, then awards once', async () => {
  fake.seed('SiteSetting', [{ key: 'teamCredits.earnOn', value: 'approved_payment' }]);
  const grant = await setupReferredStudent('pending');
  // Pending enrollment: nothing yet.
  assert.equal(await maybeAwardTeamCreditsForEnrollment('enr-1', 'enrollment'), false);
  assert.equal(await getTeamCreditBalance(grant.id), 0);
  // Still pending when the payment trigger fires: nothing.
  assert.equal(await maybeAwardTeamCreditsForEnrollment('enr-1', 'payment'), false);
  // A second enrollment for the same referred student, now paid
  // (approved payment) — the payment trigger awards.
  seedEnrollment('enr-2', 'stu-1', 'course-1', 'paid');
  assert.equal(await maybeAwardTeamCreditsForEnrollment('enr-2', 'payment'), true);
  assert.equal(await getTeamCreditBalance(grant.id), 10);
  // And the enrollment trigger must not double-award afterwards.
  assert.equal(await maybeAwardTeamCreditsForEnrollment('enr-2', 'enrollment'), false);
  assert.equal(await getTeamCreditBalance(grant.id), 10);
});

test('award: a FREE course still awards at enrollment when earn-on is approved_payment', async () => {
  fake.seed('SiteSetting', [{ key: 'teamCredits.earnOn', value: 'approved_payment' }]);
  const grant = await setupReferredStudent('free', 'course-free');
  assert.equal(await maybeAwardTeamCreditsForEnrollment('enr-1', 'enrollment'), true);
  assert.equal(await getTeamCreditBalance(grant.id), 10);
});

test('award: the amount comes from the live setting, not a hard-coded number', async () => {
  fake.seed('SiteSetting', [{ key: 'teamCredits.perEnrollment', value: '25' }]);
  const settings = await getTeamCreditSettings();
  assert.equal(settings.creditsPerEnrollment, 25);
  const grant = await setupReferredStudent('pending');
  assert.equal(await maybeAwardTeamCreditsForEnrollment('enr-1', 'enrollment'), true);
  assert.equal(await getTeamCreditBalance(grant.id), 25);
});

// ---------------------------------------------------------------------------
// (d) Redemptions — hold / approve / reject / no double-spend
// ---------------------------------------------------------------------------

async function setupBalance(grantEmail = 'maryam@codebettle.com', amount = 100) {
  const grant = await grantTeamAccess({ email: grantEmail, grantedBy: 'admin-1' });
  fake.seed('TeamCreditLedger', [
    { id: `led-seed-${grantEmail}`, teamAccessId: grant.id, kind: 'earn', amount, referenceId: 'seed-enrollment', note: 'Seeded balance' },
  ]);
  return grant;
}

test('redemption: a request holds the credits; a second request that exceeds the rest is refused', async () => {
  const grant = await setupBalance('maryam@codebettle.com', 100);
  const first = await requestTeamRedemption(grant.id, 'bottle');
  assert.ok('redemption' in first);
  assert.equal(first.redemption.status, 'pending');
  assert.equal(first.redemption.creditsSpent, 80);
  assert.equal(await getTeamCreditBalance(grant.id), 20);
  const summary = await getTeamCreditSummary(grant.id);
  assert.equal(summary.balance, 20);
  assert.equal(summary.held, 80);
  assert.equal(summary.earned, 100);
  // 80-credit bottle again: only 20 left — refused (no double-spend).
  const second = await requestTeamRedemption(grant.id, 'bottle');
  assert.ok('error' in second);
  assert.match(second.error, /Not enough credits/);
  // Even a 50-credit diary is refused with 20 left.
  const third = await requestTeamRedemption(grant.id, 'diary');
  assert.ok('error' in third);
});

test('redemption: approve keeps the hold as the permanent deduction', async () => {
  const grant = await setupBalance('maryam@codebettle.com', 100);
  const { redemption } = (await requestTeamRedemption(grant.id, 'pen')) as { redemption: { id: string } };
  const before = await listTeamCreditLedgerForMember(grant.id);
  const decided = await decideTeamRedemption(redemption.id, 'approved', 'admin-1');
  assert.equal(decided?.status, 'approved');
  assert.equal(await getTeamCreditBalance(grant.id), 70);
  // No new ledger entry on approve — the hold IS the deduction.
  assert.equal((await listTeamCreditLedgerForMember(grant.id)).length, before.length);
  // Deciding again is a no-op (null).
  assert.equal(await decideTeamRedemption(redemption.id, 'approved', 'admin-1'), null);
});

test('redemption: reject releases the held credits', async () => {
  const grant = await setupBalance('maryam@codebettle.com', 100);
  const { redemption } = (await requestTeamRedemption(grant.id, 'keychain')) as { redemption: { id: string } };
  assert.equal(await getTeamCreditBalance(grant.id), 80);
  const decided = await decideTeamRedemption(redemption.id, 'rejected', 'admin-1');
  assert.equal(decided?.status, 'rejected');
  assert.equal(await getTeamCreditBalance(grant.id), 100);
  const entries = await listTeamCreditLedgerForMember(grant.id);
  assert.equal(entries.filter((e) => e.kind === 'release').length, 1);
  assert.equal(entries.find((e) => e.kind === 'release')?.amount, 20);
  // Deciding the same rejection again does NOT release twice.
  await decideTeamRedemption(redemption.id, 'rejected', 'admin-1');
  assert.equal(await getTeamCreditBalance(grant.id), 100);
});

test('redemption: an unpriced (0-credit) goody cannot be requested', async () => {
  fake.seed('SiteSetting', [{ key: 'teamCredits.goodyPrice.pen', value: '0' }]);
  const grant = await setupBalance('maryam@codebettle.com', 100);
  const result = await requestTeamRedemption(grant.id, 'pen');
  assert.ok('error' in result);
  assert.match(result.error, /no credit price/);
});

test('redemption: balances are derived from the ledger (admin view)', async () => {
  const grant1 = await setupBalance('maryam@codebettle.com', 100);
  const grant2 = await setupBalance('bilal@codebettle.com', 40);
  const balances = await getTeamCreditBalances([grant1.id, grant2.id, 'no-such-grant']);
  assert.equal(balances.get(grant1.id), 100);
  assert.equal(balances.get(grant2.id), 40);
  assert.equal(balances.get('no-such-grant'), 0);
});

// ---------------------------------------------------------------------------
// (e) Settings — defaults, stored overrides, validation
// ---------------------------------------------------------------------------

test('settings: defaults are the placeholders (10 / enrollment / 80-50-30-20)', async () => {
  const settings = await getTeamCreditSettings();
  assert.equal(settings.creditsPerEnrollment, 10);
  assert.equal(settings.earnOn, 'enrollment');
  assert.deepEqual(settings.goodyPrices, { bottle: 80, diary: 50, pen: 30, keychain: 20 });
});

test('settings: stored rows override the defaults, and a corrupt row falls back', async () => {
  fake.seed('SiteSetting', [
    { key: 'teamCredits.perEnrollment', value: '25' },
    { key: 'teamCredits.earnOn', value: 'approved_payment' },
    { key: 'teamCredits.goodyPrice.bottle', value: '90' },
    { key: 'teamCredits.goodyPrice.pen', value: 'not-a-number' },
  ]);
  const settings = await getTeamCreditSettings();
  assert.equal(settings.creditsPerEnrollment, 25);
  assert.equal(settings.earnOn, 'approved_payment');
  assert.equal(settings.goodyPrices.bottle, 90);
  assert.equal(settings.goodyPrices.pen, 30);
});

test('settings: update validates numbers and the earn-on mode', async () => {
  await assert.rejects(
    updateSiteSettings({ teamCreditsPerEnrollment: -1 }),
    (e: unknown) => e instanceof SettingsValidationError,
  );
  await assert.rejects(
    updateSiteSettings({ teamCreditsGoodyPriceBottle: 1.5 }),
    (e: unknown) => e instanceof SettingsValidationError,
  );
  await assert.rejects(
    updateSiteSettings({ teamCreditsEarnOn: 'someday' }),
    (e: unknown) => e instanceof SettingsValidationError,
  );
  const saved = await updateSiteSettings({
    teamCreditsPerEnrollment: 15,
    teamCreditsEarnOn: 'approved_payment',
    teamCreditsGoodyPriceKeychain: 25,
  });
  assert.equal(saved.teamCreditsPerEnrollment, 15);
  assert.equal(saved.teamCreditsEarnOn, 'approved_payment');
  assert.equal(saved.teamCreditsGoodyPriceKeychain, 25);
  // Untouched fields keep their defaults.
  assert.equal(saved.teamCreditsGoodyPriceBottle, 80);
});

// ---------------------------------------------------------------------------
// (f) API routes — redeem, admin settings, admin decisions
// ---------------------------------------------------------------------------

test('route: a team member redeems; a non-member is refused; view-as is view-only', async () => {
  const grant = await setupBalance('maryam@codebettle.com', 100);
  __setTestSession(MEMBER);
  const ok = await redeem(jsonReq('http://localhost/api/team/credits/redeem', 'POST', { goody: 'pen' }));
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { redemption: { status: string; creditsSpent: number } };
  assert.equal(body.redemption.status, 'pending');
  assert.equal(body.redemption.creditsSpent, 30);
  assert.equal(await getTeamCreditBalance(grant.id), 70);

  __setTestSession(STUDENT);
  const denied = await redeem(jsonReq('http://localhost/api/team/credits/redeem', 'POST', { goody: 'pen' }));
  assert.equal(denied.status, 403);

  __setTestSession({ ...MEMBER, viewAs: { adminId: 'admin-1', adminName: 'Admin' } });
  const viewing = await redeem(jsonReq('http://localhost/api/team/credits/redeem', 'POST', { goody: 'pen' }));
  assert.equal(viewing.status, 403);

  __setTestSession(MEMBER);
  const bad = await redeem(jsonReq('http://localhost/api/team/credits/redeem', 'POST', { goody: 'jet-ski' }));
  assert.equal(bad.status, 400);
});

test('route: admin saves credit settings; a restricted admin without the credits area is refused', async () => {
  __setTestSession(ADMIN);
  const ok = await saveSettings(
    jsonReq('http://localhost/api/admin/credits/settings', 'POST', {
      creditsPerEnrollment: 12,
      earnOn: 'enrollment',
      goodyPrices: { bottle: 70, diary: 40, pen: 25, keychain: 15 },
    }),
  );
  assert.equal(ok.status, 200);
  assert.equal((await getTeamCreditSettings()).creditsPerEnrollment, 12);

  __setTestSession(RESTRICTED);
  const denied = await saveSettings(
    jsonReq('http://localhost/api/admin/credits/settings', 'POST', {
      creditsPerEnrollment: 12,
      earnOn: 'enrollment',
      goodyPrices: { bottle: 70, diary: 40, pen: 25, keychain: 15 },
    }),
  );
  assert.equal(denied.status, 403);

  __setTestSession(ADMIN);
  const bad = await saveSettings(
    jsonReq('http://localhost/api/admin/credits/settings', 'POST', {
      creditsPerEnrollment: -5,
      earnOn: 'enrollment',
      goodyPrices: { bottle: 70, diary: 40, pen: 25, keychain: 15 },
    }),
  );
  assert.equal(bad.status, 400);
});

test('route: admin decides a redemption; a second decision is a 409', async () => {
  const grant = await setupBalance('maryam@codebettle.com', 100);
  const { redemption } = (await requestTeamRedemption(grant.id, 'diary')) as { redemption: { id: string } };
  __setTestSession(ADMIN);
  const approved = await decideRedemptionRoute(
    jsonReq('http://localhost/api/admin/credits/redemptions/x', 'POST', { decision: 'approved' }),
    { params: Promise.resolve({ id: redemption.id }) },
  );
  assert.equal(approved.status, 200);
  assert.equal((await approved.json() as { redemption: { status: string } }).redemption.status, 'approved');
  const again = await decideRedemptionRoute(
    jsonReq('http://localhost/api/admin/credits/redemptions/x', 'POST', { decision: 'rejected' }),
    { params: Promise.resolve({ id: redemption.id }) },
  );
  assert.equal(again.status, 409);

  __setTestSession(RESTRICTED);
  const denied = await decideRedemptionRoute(
    jsonReq('http://localhost/api/admin/credits/redemptions/x', 'POST', { decision: 'approved' }),
    { params: Promise.resolve({ id: redemption.id }) },
  );
  assert.equal(denied.status, 403);
});

// ---------------------------------------------------------------------------
// (g) Fail-safe when the credit tables are missing
// ---------------------------------------------------------------------------

test('fail-safe: missing-table errors are recognised for every credit table', () => {
  for (const table of ['TeamReferralCode', 'TeamReferralAttribution', 'TeamCreditLedger', 'TeamRedemption']) {
    assert.equal(
      isMissingTeamCreditTableError({ code: '42P01', message: `relation "public"."${table}" does not exist` }),
      true,
    );
    assert.equal(
      isMissingTeamCreditTableError(new Error(`relation "public"."${table}" does not exist`)),
      true,
    );
  }
  assert.equal(isMissingTeamCreditTableError({ code: '42P01', message: 'relation "public"."User" does not exist' }), false);
  assert.equal(isMissingTeamCreditTableError(new Error('boom')), false);
  assert.equal(
    TEAM_CREDIT_TABLE_MISSING_MESSAGE.includes('codebettle-team-credits-migration.sql'),
    true,
  );
});

test('fail-safe: on a fresh database the credit reads return empty, never throw', async () => {
  assert.deepEqual(await listTeamCreditLedgerForMember('nobody'), []);
  assert.deepEqual(await listTeamRedemptionsForMember('nobody'), []);
  assert.equal(await getTeamCreditBalance('nobody'), 0);
  assert.deepEqual(await getTeamCreditSummary('nobody'), { balance: 0, held: 0, earned: 0 });
  assert.equal(await resolveTeamReferralForSignup('ABCDEF', 'ali@example.com'), null);
});

// ---------------------------------------------------------------------------
// (h) Design checks — no hard-coded credit numbers in the UI
// ---------------------------------------------------------------------------

test('design: the team credits page and dashboard strip read every number from settings', () => {
  const creditsPage = read('app/team/credits/page.tsx');
  assert.match(creditsPage, /getTeamCreditSettings\(\)/);
  assert.doesNotMatch(creditsPage, /creditsPerEnrollment: 10|goodyPrice.*80|price.*80/);
  const client = read('app/team/credits/credits-client.tsx');
  assert.match(client, /goodyPrices\[goody\]/);
  assert.match(client, /earnRate/);
  // No hard-coded placeholder prices anywhere in the client.
  assert.doesNotMatch(client, /bottle:\s*80|diary:\s*50|pen:\s*30|keychain:\s*20/);
  const dashboard = read('app/team/dashboard/page.tsx');
  assert.match(dashboard, /getTeamCreditSummary/);
  assert.match(dashboard, /getTeamCreditSettings/);
  const adminClient = read('app/admin/credits/credits-client.tsx');
  assert.match(adminClient, /props\.settings\.creditsPerEnrollment/);
  assert.match(adminClient, /props\.settings\.goodyPrices/);
});

test('design: the admin credits area exists and is separate from the team area', () => {
  const access = read('lib/admin-access.ts');
  assert.match(access, /key: 'credits', label: 'Credits Management', href: '\/admin\/credits'/);
  assert.match(access, /not folded into 'team'/);
  const teamPage = read('app/admin/team/page.tsx');
  assert.match(teamPage, /Credits live in their own section/);
  // The admin layout renders one icon per ADMIN_AREAS key — the
  // credits entry must exist or tsc fails on the index (regression
  // caught by tsc during PR B).
  assert.match(read('app/admin/layout.tsx'), /credits: <Coins className="w-5 h-5" \/>/);
});
