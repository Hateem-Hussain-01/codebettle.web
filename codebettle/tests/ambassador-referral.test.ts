/**
 * Ambassador referral tracking + Ambassador Dashboard (Eman, 16 Nov 2026;
 * redesigned 20 Nov 2026).
 *
 * - Referral codes are ADMIN-ASSIGNED: 6 chars from a 32-char
 *   alphabet (no 0/O/1/I), unique across ambassadors AND team codes.
 *   (Random generation survives only as the backfill path.)
 * - There is NO link tracking any more — no ?ref= capture, no
 *   cb_ref cookie, no clicks. A student joins WITH an ambassador's
 *   code, typed into the register form.
 * - Response tracking = 3 stages, derived from source tables (no
 *   counters that can drift): signups (attributions), enrollments
 *   (referred users' enrollments), payments (approved payment
 *   submissions of referred users).
 * - Multi-level tree: A refers B, B refers C — C is level 2 in A's
 *   network, level 1 in B's.
 * - Dashboard contents: code (copyable), 3 stat cards, My Credits,
 *   My Team (L1+L2), meeting link, group link + daily member count
 *   (manual), message to admin. Admin sees codes on the dedicated
 *   /admin/referral-codes page and everything else on
 *   /admin/ambassadors.
 *
 * Repo/service tests run against the fake DB; page/route wiring is
 * asserted by source inspection, following the Phase 6 design-test
 * pattern (tests/phase6-design.test.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  REFERRAL_CODE_ALPHABET,
  generateReferralCode,
  isReferralCodeFormat,
  normalizeReferralCode,
} from '../lib/referral';
import {
  attributeSignupToAmbassador,
  backfillAmbassadorsForApprovedApplications,
  countUnreadAmbassadorMessages,
  createAmbassador,
  createAmbassadorMessage,
  ensureAmbassadorForApplication,
  generateUniqueReferralCode,
  getAmbassadorByCode,
  getAmbassadorByEmail,
  getAmbassadorByUserId,
  getAmbassadorStats,
  isMissingReferralTableError,
  listAmbassadorMessages,
  listAmbassadorsWithStats,
  listMessagesForAmbassador,
  markAmbassadorMessageRead,
  resolveReferralForSignup,
  updateAmbassadorGroup,
  updateOwnAmbassadorGroup,
} from '../lib/db/ambassadors';
import { isMissingAmbassadorCreditTableError } from '../lib/db/ambassador-credits';
import { createAmbassadorApplication } from '../lib/db/ambassador-applications';
import { getAmbassadorMeetingLink, updateSiteSettings, SettingsValidationError } from '../lib/services/settings-service';
import { ADMIN_AREA_KEYS } from '../lib/admin-access';

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
    { id: 'user-d', name: 'Danish', email: 'danish@example.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2026-04-01') },
  ]);
}

async function seedAmbassadorA() {
  return createAmbassador({ email: 'ayesha@example.com', userId: 'amb-user-a' });
}

// ---------------------------------------------------------------------------
// Referral codes: random, unguessable, unique
// ---------------------------------------------------------------------------

test('referral codes are 6 chars from the 32-char alphabet (no 0/O/1/I)', () => {
  for (let i = 0; i < 100; i++) {
    const code = generateReferralCode();
    assert.equal(code.length, 6);
    assert.ok(isReferralCodeFormat(code), code);
    assert.ok(!/[01OI]/.test(code), code);
    for (const ch of code) assert.ok(REFERRAL_CODE_ALPHABET.includes(ch), ch);
  }
});

test('1000 generated codes are all unique', () => {
  const codes = new Set<string>();
  for (let i = 0; i < 1000; i++) codes.add(generateReferralCode());
  assert.equal(codes.size, 1000);
});

test('generateUniqueReferralCode regenerates on collision', async () => {
  seedUsers();
  // A deterministic rand that first spells the existing code, then a fresh one.
  const taken = 'AAAAAA';
  fake.seed('Ambassador', [
    { id: 'amb-1', email: 'ayesha@example.com', referralCode: taken, status: 'active', createdAt: D('2026-01-01'), updatedAt: D('2026-01-01') },
  ]);
  const alphabetIndex = (ch: string) => REFERRAL_CODE_ALPHABET.indexOf(ch);
  const scripted = [
    ...taken.split('').map((ch) => alphabetIndex(ch)),
    ...'BBBBBB'.split('').map((ch) => alphabetIndex(ch)),
  ];
  let calls = 0;
  const rand = () => scripted[calls++] ?? 1;
  const code = await generateUniqueReferralCode(rand);
  assert.equal(code, 'BBBBBB');
  assert.ok(calls > 10, 'the taken code was tried first, then regenerated');
});

test('createAmbassador mints a code and is idempotent by email', async () => {
  seedUsers();
  const first = await createAmbassador({ email: 'Ayesha@Example.com' });
  assert.ok(isReferralCodeFormat(first.referralCode));
  assert.equal(first.email, 'ayesha@example.com');
  assert.equal(first.status, 'active');
  const second = await createAmbassador({ email: 'ayesha@example.com' });
  assert.equal(second.id, first.id);
  assert.equal(second.referralCode, first.referralCode);
});

test('getAmbassadorByCode normalizes case; unknown codes return null', async () => {
  seedUsers();
  const created = await seedAmbassadorA();
  assert.equal((await getAmbassadorByCode(created.referralCode.toLowerCase()))?.id, created.id);
  assert.equal(await getAmbassadorByCode('ZZZZZZ'), null);
  assert.equal(await getAmbassadorByCode('not-a-code'), null);
});

test('normalizeReferralCode trims + uppercases', () => {
  assert.equal(normalizeReferralCode('  abcdef '), 'ABCDEF');
});

// ---------------------------------------------------------------------------
// Signup resolution: the code is typed into the register form
// ---------------------------------------------------------------------------

test('resolveReferralForSignup: valid code attributes; unknown, inactive and self-referral do not', async () => {
  seedUsers();
  const ambassador = await seedAmbassadorA();
  assert.equal(await resolveReferralForSignup(ambassador.referralCode, 'bilal@example.com'), ambassador.id);
  assert.equal(await resolveReferralForSignup('ZZZZZZ', 'bilal@example.com'), null);
  assert.equal(await resolveReferralForSignup(ambassador.referralCode, 'ayesha@example.com'), null);
  assert.equal(await resolveReferralForSignup(ambassador.referralCode, 'AYESHA@EXAMPLE.COM'), null);
  // Inactive ambassador's code attributes nothing.
  fake.seed('Ambassador', [
    { id: 'amb-off', email: 'off@example.com', referralCode: 'CCCCCC', status: 'inactive', createdAt: D('2026-01-01'), updatedAt: D('2026-01-01') },
  ]);
  assert.equal(await resolveReferralForSignup('CCCCCC', 'bilal@example.com'), null);
});

// ---------------------------------------------------------------------------
// 3-stage stats: each stage moves exactly one number
// ---------------------------------------------------------------------------

test('3-stage counting: signup, then enrollment, then payment each move exactly one stage', async () => {
  seedUsers();
  const ambassador = await seedAmbassadorA();
  // Stage 2 — signup.
  assert.equal(await attributeSignupToAmbassador(ambassador.id, 'user-b'), true);
  let stats = await getAmbassadorStats(ambassador.id);
  assert.deepEqual(stats.stats, { signups: 1, enrollments: 0, payments: 0 });
  assert.equal(stats.teamLevel1[0].stage, 'signed up');
  // Stage 3 — enrollment (pending, unpaid).
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'user-b', courseId: 'course-1', batchId: null, enrolledAt: D('2026-02-02'), isCompleted: false, completedAt: null, paymentStatus: 'pending', amountPaid: 0, couponUsed: null, deletedAt: null },
  ]);
  stats = await getAmbassadorStats(ambassador.id);
  assert.deepEqual(stats.stats, { signups: 1, enrollments: 1, payments: 0 });
  assert.equal(stats.teamLevel1[0].stage, 'enrolled');
  // Stage 4 — approved payment submission.
  fake.seed('PaymentSubmission', [
    { id: 'pay-1', enrollmentId: 'enr-1', method: 'jazzcash', amountPkr: 1500, transactionRef: 'REF-1', accountSnapshot: {}, reviewStatus: 'approved', submittedAt: D('2026-02-03'), createdAt: D('2026-02-03'), updatedAt: D('2026-02-03') },
  ]);
  stats = await getAmbassadorStats(ambassador.id);
  assert.deepEqual(stats.stats, { signups: 1, enrollments: 1, payments: 1 });
  assert.equal(stats.teamLevel1[0].stage, 'paid');
  // A merely-submitted (not approved) payment does NOT count as a payment.
  fake.seed('Enrollment', [
    { id: 'enr-2', studentId: 'user-c', courseId: 'course-1', batchId: null, enrolledAt: D('2026-03-02'), isCompleted: false, completedAt: null, paymentStatus: 'pending', amountPaid: 0, couponUsed: null, deletedAt: null },
  ]);
  fake.seed('PaymentSubmission', [
    { id: 'pay-2', enrollmentId: 'enr-2', method: 'jazzcash', amountPkr: 1500, transactionRef: 'REF-2', accountSnapshot: {}, reviewStatus: 'submitted', submittedAt: D('2026-03-03'), createdAt: D('2026-03-03'), updatedAt: D('2026-03-03') },
  ]);
  assert.equal(await attributeSignupToAmbassador(ambassador.id, 'user-c'), true);
  stats = await getAmbassadorStats(ambassador.id);
  assert.deepEqual(stats.stats, { signups: 2, enrollments: 2, payments: 1 });
  assert.equal(stats.teamLevel1.find((m) => m.id === 'user-c')?.stage, 'enrolled');
  // A free-course enrollment counts at stage 3 only (no payment exists).
  fake.seed('Enrollment', [
    { id: 'enr-3', studentId: 'user-d', courseId: 'course-4', batchId: null, enrolledAt: D('2026-04-02'), isCompleted: false, completedAt: null, paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
  ]);
  assert.equal(await attributeSignupToAmbassador(ambassador.id, 'user-d'), true);
  stats = await getAmbassadorStats(ambassador.id);
  assert.deepEqual(stats.stats, { signups: 3, enrollments: 3, payments: 1 });
  assert.equal(stats.teamLevel1.find((m) => m.id === 'user-d')?.stage, 'enrolled');
});

test('attribution is one user, one ambassador (second attribution is refused)', async () => {
  seedUsers();
  const a = await seedAmbassadorA();
  const b = await createAmbassador({ email: 'other@example.com' });
  assert.equal(await attributeSignupToAmbassador(a.id, 'user-b'), true);
  assert.equal(await attributeSignupToAmbassador(b.id, 'user-b'), false);
  assert.equal((await getAmbassadorStats(a.id)).stats.signups, 1);
  assert.equal((await getAmbassadorStats(b.id)).stats.signups, 0);
});

// ---------------------------------------------------------------------------
// Multi-level tree: level 1 vs level 2
// ---------------------------------------------------------------------------

test('tree: A refers B, B refers C — C is level 2 for A, level 1 for B', async () => {
  seedUsers();
  const a = await seedAmbassadorA();
  // B joins via A, then becomes an ambassador with their own code.
  await attributeSignupToAmbassador(a.id, 'user-b');
  const b = await createAmbassador({ email: 'bilal@example.com', userId: 'user-b' });
  assert.notEqual(b.referralCode, a.referralCode);
  // C joins via B.
  await attributeSignupToAmbassador(b.id, 'user-c');
  const statsA = await getAmbassadorStats(a.id);
  assert.deepEqual(statsA.teamLevel1.map((m) => m.id), ['user-b']);
  assert.deepEqual(statsA.teamLevel2.map((m) => m.id), ['user-c']);
  assert.equal(statsA.teamLevel2[0].viaName, 'Bilal');
  assert.equal(statsA.stats.signups, 1);
  const statsB = await getAmbassadorStats(b.id);
  assert.deepEqual(statsB.teamLevel1.map((m) => m.id), ['user-c']);
  assert.deepEqual(statsB.teamLevel2, []);
});

// ---------------------------------------------------------------------------
// Dashboard guard: only the ambassador's own data
// ---------------------------------------------------------------------------

test('dashboard guard: non-ambassadors have no record; ambassador A sees only their own data', async () => {
  seedUsers();
  assert.equal(await getAmbassadorByUserId('user-b'), null);
  const a = await seedAmbassadorA();
  const b = await createAmbassador({ email: 'other@example.com' });
  await attributeSignupToAmbassador(a.id, 'user-b');
  await attributeSignupToAmbassador(b.id, 'user-c');
  assert.equal((await getAmbassadorStats(a.id)).stats.signups, 1);
  assert.equal((await getAmbassadorStats(b.id)).stats.signups, 1);
  assert.equal((await getAmbassadorByUserId('amb-user-a'))?.id, a.id);
});

// ---------------------------------------------------------------------------
// Approve + backfill: codes are created on approve and for older approvals
// ---------------------------------------------------------------------------

test('approving an application creates the ambassador + code; backfill covers older approvals', async () => {
  const application = await createAmbassadorApplication({
    fullName: 'Ayesha',
    whatsapp: '03001234567',
    email: 'ayesha@example.com',
    university: 'UAF',
    departmentSemester: 'BS 5th',
    leadershipPosition: 'None / General Student',
    promotionPlan: 'Share in class groups.',
    priorAmbassadorExperience: 'No',
  });
  const ambassador = await ensureAmbassadorForApplication(application);
  assert.ok(isReferralCodeFormat(ambassador.referralCode));
  assert.equal(ambassador.applicationId, application.id);
  assert.equal(ambassador.email, 'ayesha@example.com');

  // An application approved BEFORE this feature shipped has no row —
  // the backfill creates it (idempotent: a second run creates none).
  const old = await createAmbassadorApplication({
    fullName: 'Old One',
    whatsapp: '03007654321',
    email: 'old@example.com',
    university: 'UAF',
    departmentSemester: 'BS 3rd',
    leadershipPosition: 'Class Representative (CR)',
    promotionPlan: 'Posters.',
    priorAmbassadorExperience: 'Yes',
  });
  assert.equal(await backfillAmbassadorsForApprovedApplications(), 0);
  // (Still pending, so nothing to backfill.) Approve it directly in
  // the table, then backfill.
  fake.tables['AmbassadorApplication']?.get(old.id) &&
    ((fake.tables['AmbassadorApplication'].get(old.id) as Record<string, unknown>).status = 'approved');
  assert.equal(await backfillAmbassadorsForApprovedApplications(), 1);
  assert.equal(await backfillAmbassadorsForApprovedApplications(), 0);
  const backfilled = await getAmbassadorByEmail('old@example.com');
  assert.ok(backfilled && isReferralCodeFormat(backfilled.referralCode));
  assert.equal(backfilled?.applicationId, old.id);
});

// ---------------------------------------------------------------------------
// Group link + daily member count: own record only
// ---------------------------------------------------------------------------

test('group update: own record only, count stamps the last-updated date, link-only does not', async () => {
  seedUsers();
  await seedAmbassadorA();
  await createAmbassador({ email: 'other@example.com', userId: 'user-b' });
  const updated = await updateOwnAmbassadorGroup('amb-user-a', {
    groupLink: 'https://chat.whatsapp.com/AbCdEf',
    groupMemberCount: 120,
  });
  assert.equal(updated?.groupLink, 'https://chat.whatsapp.com/AbCdEf');
  assert.equal(updated?.groupMemberCount, 120);
  assert.ok(updated?.groupCountUpdatedAt, 'count update stamps the date');
  // B's record exists and is untouched.
  const bAfter = await getAmbassadorByUserId('user-b');
  assert.ok(bAfter, 'B is an ambassador too');
  assert.equal(bAfter?.groupMemberCount, undefined);
  // A link-only update does not re-stamp the count date.
  const stamped = updated!.groupCountUpdatedAt;
  const linkOnly = await updateOwnAmbassadorGroup('amb-user-a', { groupLink: 'https://chat.whatsapp.com/XyZ' });
  assert.equal(linkOnly?.groupLink, 'https://chat.whatsapp.com/XyZ');
  assert.equal(linkOnly?.groupMemberCount, 120);
  assert.equal(linkOnly?.groupCountUpdatedAt, stamped);
  // A non-ambassador cannot update anything.
  assert.equal(await updateOwnAmbassadorGroup('user-c', { groupMemberCount: 5 }), null);
});

test('updateAmbassadorGroup by id still only touches that one row', async () => {
  seedUsers();
  await seedAmbassadorA();
  const b = await createAmbassador({ email: 'other@example.com' });
  await updateAmbassadorGroup(b.id, { groupMemberCount: 7 });
  assert.equal((await getAmbassadorByUserId('amb-user-a'))?.groupMemberCount, undefined);
  assert.equal((await getAmbassadorByCode(b.referralCode))?.groupMemberCount, 7);
});

// ---------------------------------------------------------------------------
// Messages to the admin: visibility + read/unread
// ---------------------------------------------------------------------------

test('messages: admin sees all, each ambassador sees only their own, mark-as-read works', async () => {
  seedUsers();
  const a = await seedAmbassadorA();
  const b = await createAmbassador({ email: 'other@example.com' });
  const m1 = await createAmbassadorMessage(a.id, 'My group link stopped working.');
  await createAmbassadorMessage(b.id, 'When is the next meeting?');
  assert.deepEqual((await listMessagesForAmbassador(a.id)).map((m) => m.id), [m1.id]);
  assert.deepEqual((await listMessagesForAmbassador(b.id)).map((m) => m.message), ['When is the next meeting?']);
  assert.equal((await listAmbassadorMessages()).length, 2);
  assert.equal(await countUnreadAmbassadorMessages(), 2);
  const read = await markAmbassadorMessageRead(m1.id);
  assert.equal(read?.read, true);
  assert.equal(await countUnreadAmbassadorMessages(), 1);
  assert.equal(await markAmbassadorMessageRead('no-such-id'), null);
});

// ---------------------------------------------------------------------------
// Meeting link: admin save/update, ambassadors see the current value
// ---------------------------------------------------------------------------

test('meeting link: save/update round-trips; ambassadors always read the current value', async () => {
  assert.equal(await getAmbassadorMeetingLink(), '');
  await updateSiteSettings({ ambassadorMeetingLink: 'https://meet.google.com/abc-defg-hij' });
  assert.equal(await getAmbassadorMeetingLink(), 'https://meet.google.com/abc-defg-hij');
  // Changing it updates what ambassadors see — no stale value.
  await updateSiteSettings({ ambassadorMeetingLink: 'https://meet.google.com/xyz-1234-ab' });
  assert.equal(await getAmbassadorMeetingLink(), 'https://meet.google.com/xyz-1234-ab');
  // Clearing it hides the card again.
  await updateSiteSettings({ ambassadorMeetingLink: '' });
  assert.equal(await getAmbassadorMeetingLink(), '');
});

test('meeting link: a non-URL is rejected', async () => {
  await assert.rejects(updateSiteSettings({ ambassadorMeetingLink: 'not a url' }), SettingsValidationError);
  await assert.rejects(updateSiteSettings({ ambassadorMeetingLink: 'javascript:alert(1)' }), SettingsValidationError);
  assert.equal(await getAmbassadorMeetingLink(), '');
});

// ---------------------------------------------------------------------------
// Fail-safe: missing tables read empty instead of throwing
// ---------------------------------------------------------------------------

test('missing-table errors are recognised for every referral table', () => {
  for (const table of ['Ambassador', 'ReferralAttribution', 'AmbassadorMessage']) {
    assert.equal(isMissingReferralTableError({ code: '42P01', message: `relation "public"."${table}" does not exist` }), true);
  }
  // ReferralClick is gone (the redesign drops the table) — a
  // "relation does not exist" for it is no longer a known missing
  // table. The new ledger table has its own recogniser.
  assert.equal(isMissingReferralTableError({ code: '42P01', message: 'relation "public"."ReferralClick" does not exist' }), false);
  assert.equal(isMissingAmbassadorCreditTableError({ code: '42P01', message: 'relation "public"."AmbassadorCreditLedger" does not exist' }), true);
  assert.equal(isMissingReferralTableError({ code: '42P01', message: 'relation "public"."User" does not exist' }), false);
  assert.equal(isMissingReferralTableError({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(isMissingReferralTableError(null), false);
});

test('admin list is empty (not an error) before the migration runs', async () => {
  assert.deepEqual(await listAmbassadorsWithStats(), []);
  assert.deepEqual(await listAmbassadorMessages(), []);
  assert.equal(await countUnreadAmbassadorMessages(), 0);
});

// ---------------------------------------------------------------------------
// Wiring (source inspection, Phase 6 design-test pattern)
// ---------------------------------------------------------------------------

test('wiring: student layout shows the Ambassador nav item only to ambassadors; dashboard guards non-ambassadors', () => {
  const studentLayout = read('app/student/layout.tsx');
  assert.ok(studentLayout.includes("getAmbassadorByUserId(session.id)"));
  assert.ok(studentLayout.includes("href: '/student/ambassador'"));
  assert.ok(studentLayout.includes("label: 'Ambassador'"));
  const page = read('app/student/ambassador/page.tsx');
  assert.ok(page.includes('You are not an ambassador yet'));
  assert.ok(page.includes("href=\"/become-ambassador\""));
  assert.ok(page.includes('getAmbassadorStats'));
  assert.ok(page.includes('getAmbassadorMeetingLink'));
});

test('wiring: register reads the referral code from the form field — no cookie, no link capture', () => {
  const route = read('app/api/auth/route.ts');
  // The code arrives in the register body and is resolved server-side.
  assert.ok(route.includes('referralCode'), 'register schema + resolution read the referralCode field');
  assert.ok(route.includes('resolveReferralForSignup'));
  assert.ok(route.includes('resolveTeamReferralForSignup'));
  // No link tracking survives anywhere on the path: no cookie, no
  // ?ref= capture in the proxy, no track endpoint.
  assert.ok(!route.includes('REFERRAL_COOKIE'), 'no referral cookie is read');
  assert.ok(!route.includes('referredByAmbassadorId: parsed.data'), 'no client-sent referrer field is accepted');
  const proxy = read('proxy.ts');
  assert.ok(!proxy.includes("searchParams.get('ref')"), 'proxy no longer captures ?ref=');
  assert.ok(!proxy.includes('/api/referral/track'), 'no click tracking call');
  assert.ok(!proxy.includes('withReferralCookie'), 'no referral cookie is set');
  // The form itself carries the code field.
  const form = read('components/auth/RegisterForm.tsx');
  assert.ok(form.includes('Referral code (optional)'));
  assert.ok(form.includes('referralCode'));
});

test('wiring: group update resolves the ambassador from the session — no ambassador id in the request', () => {
  const route = read('app/api/student/ambassador/route.ts');
  assert.ok(route.includes('updateOwnAmbassadorGroup(auth.session.id'));
  assert.ok(!route.includes('ambassadorId'), 'the request carries no ambassador id to forge');
  const messagesRoute = read('app/api/student/ambassador/messages/route.ts');
  assert.ok(messagesRoute.includes('getAmbassadorByUserId(auth.session.id)'));
});

test('wiring: no new admin tab — the only ambassador area key is "ambassadors"', () => {
  const ambassadorKeys = ADMIN_AREA_KEYS.filter((k) => k.startsWith('ambassador'));
  assert.deepEqual(ambassadorKeys, ['ambassadors']);
  const adminLayout = read('app/admin/layout.tsx');
  assert.ok(adminLayout.includes('ADMIN_AREAS'), 'the sidebar renders from ADMIN_AREAS, nothing new was added');
  const adminPage = read('app/admin/ambassadors/page.tsx');
  assert.ok(adminPage.includes('listAmbassadorsWithStats'));
  assert.ok(adminPage.includes('listAmbassadorMessages'));
  assert.ok(adminPage.includes('getAmbassadorMeetingLink'));
  // No new admin directory was created for this feature.
  const adminDirs = readdirSync(join(root, 'app/admin'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  assert.ok(!adminDirs.includes('ambassador-messages'), 'no ambassador-messages admin section');
  assert.ok(!adminDirs.includes('ambassador-referrals'), 'no ambassador-referrals admin section');
});

test('wiring: /ambassador/login exists with SEO metadata and ambassador redirect; footer + sitemap link it', () => {
  const page = read('app/ambassador/login/page.tsx');
  assert.ok(page.includes("title: 'Login as Ambassador | CodeBettle'"));
  assert.ok(page.includes("redirect('/student/ambassador')"));
  assert.ok(page.includes('You are signed in, but not an ambassador yet'));
  const footer = read('components/layout/Footer.tsx');
  assert.ok(footer.includes('/ambassador/login?redirect=/student/ambassador'));
  assert.ok(footer.includes('Already an ambassador?'));
  const become = read('app/become-ambassador/page.tsx');
  assert.ok(become.includes('/ambassador/login?redirect=/student/ambassador'));
  const sitemap = read('app/sitemap.ts');
  assert.ok(sitemap.includes("path: '/ambassador/login'"));
});
