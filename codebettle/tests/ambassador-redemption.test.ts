/**
 * Ambassador Redemption (Eman, 21 Nov 2026) — ambassadors redeem
 * their credits for goodies, the SAME catalogue + prices as the team
 * system (branded bottle, diary, ballpoint pen, keychain; prices set
 * by the admin in Credits Management, never hard-coded).
 *
 * - A request holds the credits immediately (ledger hold entry) —
 *   no double-spend; approve keeps the hold as the deduction,
 *   reject releases it back. The ledger is append-only — the balance
 *   is SUM(amount), never a stored column.
 * - Prices come from the live admin setting (getTeamCreditSettings),
 *   so one price change serves team members and ambassadors alike.
 * - The ambassador dashboard shows the redeem card + my redemptions;
 *   Credits Management decides ambassador requests the same way it
 *   decides team ones.
 * - Fail-safe: until Eman runs
 *   codebettle-ambassador-redemption-migration.sql, reads return
 *   empty and requests/decisions refuse with that file named —
 *   while credit earning keeps working.
 *
 * Repo/service tests run against the fake DB; wiring is asserted by
 * source inspection, following the Phase 6 design-test pattern.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { createAmbassador, updateAmbassadorStatus } from '../lib/db/ambassadors';
import {
  decideAmbassadorRedemption,
  getAmbassadorCreditBalance,
  isMissingAmbassadorRedemptionTableError,
  listAmbassadorCreditLedgerForAmbassador,
  listAmbassadorRedemptionsForAmbassador,
  requestAmbassadorRedemption,
  AMBASSADOR_REDEMPTION_TABLE_MISSING_MESSAGE,
} from '../lib/db/ambassador-credits';
import { getTeamCreditSettings } from '../lib/services/settings-service';
import { POST as redeem } from '../app/api/student/ambassador/redemptions/route';
import { POST as decideRedemptionRoute } from '../app/api/admin/ambassador-redemptions/[id]/route';
import type { SessionUser } from '../lib/services/auth-service';

const D = (s: string) => new Date(s);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin', isAdmin: true };
const RESTRICTED: SessionUser = {
  id: 'admin-2', name: 'Restricted', email: 'restricted@codebettle.com', role: 'admin', isAdmin: true,
  adminPermissions: { team: true },
};
const AMBASSADOR_USER: SessionUser = { id: 'amb-user-a', name: 'Ayesha', email: 'ayesha@example.com', role: 'student' };
const STUDENT: SessionUser = { id: 'user-b', name: 'Bilal', email: 'bilal@example.com', role: 'student' };

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
    { id: 'amb-user-a', name: 'Ayesha', email: 'ayesha@example.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'user-b', name: 'Bilal', email: 'bilal@example.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
}

test.beforeEach(reset);
test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

async function setupBalance(amount = 100) {
  const ambassador = await createAmbassador({ email: 'ayesha@example.com', userId: 'amb-user-a', referralCode: 'FG2SZU' });
  fake.seed('AmbassadorCreditLedger', [
    { id: 'led-seed', ambassadorId: ambassador.id, kind: 'earn', amount, referenceId: 'seed-enrollment', note: 'Seeded balance' },
  ]);
  return ambassador;
}

// ---------------------------------------------------------------------------
// (a) Redemptions — hold / approve / reject / no double-spend
// ---------------------------------------------------------------------------

test('redemption: a request holds the credits; a second request that exceeds the rest is refused', async () => {
  const ambassador = await setupBalance(100);
  const first = await requestAmbassadorRedemption(ambassador.id, 'bottle');
  assert.ok('redemption' in first);
  assert.equal(first.redemption.status, 'pending');
  assert.equal(first.redemption.creditsSpent, 80);
  assert.equal(await getAmbassadorCreditBalance(ambassador.id), 20);
  // 80-credit bottle again: only 20 left — refused (no double-spend).
  const second = await requestAmbassadorRedemption(ambassador.id, 'bottle');
  assert.ok('error' in second);
  assert.match(second.error, /Not enough credits/);
  // Even a 50-credit diary is refused with 20 left.
  const third = await requestAmbassadorRedemption(ambassador.id, 'diary');
  assert.ok('error' in third);
});

test('redemption: approve keeps the hold as the permanent deduction', async () => {
  const ambassador = await setupBalance(100);
  const { redemption } = (await requestAmbassadorRedemption(ambassador.id, 'pen')) as { redemption: { id: string } };
  const before = await listAmbassadorCreditLedgerForAmbassador(ambassador.id);
  const decided = await decideAmbassadorRedemption(redemption.id, 'approved', 'admin-1');
  assert.equal(decided?.status, 'approved');
  assert.equal(await getAmbassadorCreditBalance(ambassador.id), 70);
  // No new ledger entry on approve — the hold IS the deduction.
  assert.equal((await listAmbassadorCreditLedgerForAmbassador(ambassador.id)).length, before.length);
  // Deciding again is a no-op (null).
  assert.equal(await decideAmbassadorRedemption(redemption.id, 'approved', 'admin-1'), null);
});

test('redemption: reject releases the held credits', async () => {
  const ambassador = await setupBalance(100);
  const { redemption } = (await requestAmbassadorRedemption(ambassador.id, 'keychain')) as { redemption: { id: string } };
  assert.equal(await getAmbassadorCreditBalance(ambassador.id), 80);
  const decided = await decideAmbassadorRedemption(redemption.id, 'rejected', 'admin-1');
  assert.equal(decided?.status, 'rejected');
  assert.equal(await getAmbassadorCreditBalance(ambassador.id), 100);
  const entries = await listAmbassadorCreditLedgerForAmbassador(ambassador.id);
  assert.equal(entries.filter((e) => e.kind === 'release').length, 1);
  assert.equal(entries.find((e) => e.kind === 'release')?.amount, 20);
  // Deciding the same rejection again does NOT release twice.
  await decideAmbassadorRedemption(redemption.id, 'rejected', 'admin-1');
  assert.equal(await getAmbassadorCreditBalance(ambassador.id), 100);
});

test('redemption: an unpriced (0-credit) goody cannot be requested', async () => {
  fake.seed('SiteSetting', [{ key: 'teamCredits.goodyPrice.pen', value: '0' }]);
  const ambassador = await setupBalance(100);
  const result = await requestAmbassadorRedemption(ambassador.id, 'pen');
  assert.ok('error' in result);
  assert.match(result.error, /no credit price/);
});

test('redemption: the price comes from the live admin setting, not a hard-coded number', async () => {
  fake.seed('SiteSetting', [{ key: 'teamCredits.goodyPrice.bottle', value: '90' }]);
  assert.equal((await getTeamCreditSettings()).goodyPrices.bottle, 90);
  const ambassador = await setupBalance(100);
  const first = await requestAmbassadorRedemption(ambassador.id, 'bottle');
  assert.ok('redemption' in first);
  assert.equal(first.redemption.creditsSpent, 90);
  assert.equal(await getAmbassadorCreditBalance(ambassador.id), 10);
});

test('redemption: a non-ambassador or inactive ambassador cannot request', async () => {
  const notAmbassador = await requestAmbassadorRedemption('no-such-ambassador', 'pen');
  assert.ok('error' in notAmbassador);
  assert.match(notAmbassador.error, /Ambassador access required/);
  const ambassador = await setupBalance(100);
  await updateAmbassadorStatus(ambassador.id, 'inactive');
  const inactive = await requestAmbassadorRedemption(ambassador.id, 'pen');
  assert.ok('error' in inactive);
  assert.match(inactive.error, /Ambassador access required/);
});

// ---------------------------------------------------------------------------
// (b) API routes — redeem, admin decisions
// ---------------------------------------------------------------------------

test('route: an ambassador redeems; a non-ambassador is refused; view-as is view-only', async () => {
  const ambassador = await setupBalance(100);
  __setTestSession(AMBASSADOR_USER);
  const ok = await redeem(jsonReq('http://localhost/api/student/ambassador/redemptions', 'POST', { goody: 'pen' }));
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { redemption: { status: string; creditsSpent: number } };
  assert.equal(body.redemption.status, 'pending');
  assert.equal(body.redemption.creditsSpent, 30);
  assert.equal(await getAmbassadorCreditBalance(ambassador.id), 70);

  __setTestSession(STUDENT);
  const denied = await redeem(jsonReq('http://localhost/api/student/ambassador/redemptions', 'POST', { goody: 'pen' }));
  assert.equal(denied.status, 404);

  __setTestSession({ ...AMBASSADOR_USER, viewAs: { adminId: 'admin-1', adminName: 'Admin' } });
  const viewing = await redeem(jsonReq('http://localhost/api/student/ambassador/redemptions', 'POST', { goody: 'pen' }));
  assert.equal(viewing.status, 403);

  __setTestSession(AMBASSADOR_USER);
  const bad = await redeem(jsonReq('http://localhost/api/student/ambassador/redemptions', 'POST', { goody: 'jet-ski' }));
  assert.equal(bad.status, 400);
});

test('route: admin decides an ambassador redemption; a second decision is a 409', async () => {
  const ambassador = await setupBalance(100);
  const { redemption } = (await requestAmbassadorRedemption(ambassador.id, 'diary')) as { redemption: { id: string } };
  __setTestSession(ADMIN);
  const approved = await decideRedemptionRoute(
    jsonReq('http://localhost/api/admin/ambassador-redemptions/x', 'POST', { decision: 'approved' }),
    { params: Promise.resolve({ id: redemption.id }) },
  );
  assert.equal(approved.status, 200);
  assert.equal((await approved.json() as { redemption: { status: string } }).redemption.status, 'approved');
  const again = await decideRedemptionRoute(
    jsonReq('http://localhost/api/admin/ambassador-redemptions/x', 'POST', { decision: 'rejected' }),
    { params: Promise.resolve({ id: redemption.id }) },
  );
  assert.equal(again.status, 409);

  __setTestSession(RESTRICTED);
  const denied = await decideRedemptionRoute(
    jsonReq('http://localhost/api/admin/ambassador-redemptions/x', 'POST', { decision: 'approved' }),
    { params: Promise.resolve({ id: redemption.id }) },
  );
  assert.equal(denied.status, 403);
});

// ---------------------------------------------------------------------------
// (c) Fail-safe when the redemption table is missing
// ---------------------------------------------------------------------------

test('fail-safe: missing-table errors are recognised for the redemption table', () => {
  assert.equal(
    isMissingAmbassadorRedemptionTableError({ code: '42P01', message: 'relation "public"."AmbassadorRedemption" does not exist' }),
    true,
  );
  assert.equal(
    isMissingAmbassadorRedemptionTableError(new Error('relation "public"."AmbassadorRedemption" does not exist')),
    true,
  );
  assert.equal(isMissingAmbassadorRedemptionTableError({ code: '42P01', message: 'relation "public"."User" does not exist' }), false);
  assert.equal(isMissingAmbassadorRedemptionTableError(new Error('boom')), false);
  assert.equal(
    AMBASSADOR_REDEMPTION_TABLE_MISSING_MESSAGE.includes('codebettle-ambassador-redemption-migration.sql'),
    true,
  );
});

test('fail-safe: on a fresh database the redemption reads return empty, never throw', async () => {
  assert.deepEqual(await listAmbassadorRedemptionsForAmbassador('nobody'), []);
  assert.equal(await getAmbassadorCreditBalance('nobody'), 0);
});

// ---------------------------------------------------------------------------
// (d) Design checks — wiring + no hard-coded credit numbers in the UI
// ---------------------------------------------------------------------------

test('design: the ambassador dashboard reads prices from settings and posts to the redeem route', () => {
  const page = read('app/student/ambassador/page.tsx');
  assert.match(page, /getTeamCreditSettings\(\)/);
  assert.match(page, /listAmbassadorRedemptionsForAmbassador\(/);
  assert.match(page, /isAmbassadorRedemptionTableReady\(\)/);
  const client = read('app/student/ambassador/ambassador-dashboard-client.tsx');
  assert.match(client, /Redeem for goodies/);
  assert.match(client, /goodyPrices\[goody\]/);
  assert.match(client, /\/api\/student\/ambassador\/redemptions/);
  assert.match(client, /My redemptions/);
  // No hard-coded placeholder prices anywhere in the client.
  assert.doesNotMatch(client, /bottle:\s*80|diary:\s*50|pen:\s*30|keychain:\s*20/);
  // The old "more on that soon" copy is gone — redemption is live.
  assert.doesNotMatch(client, /more on that soon/);
});

test('design: Credits Management decides ambassador redemptions the same way as team ones', () => {
  const page = read('app/admin/credits/page.tsx');
  assert.match(page, /listAmbassadorRedemptions\(\)/);
  assert.match(page, /isAmbassadorRedemptionTableReady\(\)/);
  assert.match(page, /ambassadorRedemptions/);
  const client = read('app/admin/credits/credits-client.tsx');
  assert.match(client, /Ambassador redemption requests/);
  assert.match(client, /\/api\/admin\/ambassador-redemptions\//);
});

test('design: the migration + SQL twin create the redemption table and widen the ledger kind check', () => {
  const migration = read('migrations/app/20261120T1908_add_ambassador_redemptions/migration.ts');
  assert.match(migration, /AmbassadorRedemption/);
  assert.match(migration, /'earn', 'hold', 'release'/);
  assert.ok(existsSync(join(root, '../../your_files/codebettle-ambassador-redemption-migration.sql')));
  const sql = readFileSync(join(root, '../../your_files/codebettle-ambassador-redemption-migration.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "public"\."AmbassadorRedemption"/);
  assert.match(sql, /"kind" IN \('earn', 'hold', 'release'\)/);
});
