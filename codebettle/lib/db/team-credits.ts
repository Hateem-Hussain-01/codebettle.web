/**
 * Team Credit System repository (PR B, Eman, 16 Nov 2026).
 *
 * Credits live ONLY in the Team Portal, earned ONLY on student
 * referral enrollment — never for tasks, assignments or submissions.
 * Each team member has their OWN random 6-char referral code
 * (ambassador pattern, same alphabet) that is checked against
 * ambassador codes too, so one code belongs to exactly one referrer.
 * The shared `?ref=` capture + `cb_ref` cookie attributes a signup
 * to whichever owns the code.
 *
 * LEDGER (append-only — there is NO balance column anywhere):
 * - earn: +N when a referred student enrolls (or pays, per the admin
 *   setting `teamCredits.earnOn`), referenceId = the enrollment id.
 *   One earn per enrollment, ever (explicit check + the
 *   (kind, referenceId) unique constraint as backstop).
 * - hold: -N when a redemption is requested, referenceId = the
 *   redemption id. Pending requests HOLD credits — no double-spend.
 * - release: +N when a redemption is rejected, referenceId = the
 *   redemption id. An approved redemption needs no new entry: the
 *   hold IS the permanent deduction.
 * A member's balance is SUM(amount) over their ledger rows.
 *
 * NUMBERS (Eman sets the real ones himself — the values in
 * lib/services/settings-service.ts are PLACEHOLDERS): every earn
 * amount and goody price is read from the live admin setting at the
 * moment it is used. Nothing in this file hard-codes a credit number.
 *
 * FAIL-SAFE (same shape as lib/db/team.ts): the TeamReferralCode /
 * TeamReferralAttribution / TeamCreditLedger / TeamRedemption tables
 * exist only after Eman runs codebettle-team-credits-migration.sql
 * (migration 20261116T2151_add_team_credits). Until then every read
 * returns its empty fallback, attribution returns false, and award
 * calls return false — the team portal keeps working, credits just
 * show as "not set up yet". No existing table is touched.
 */
import { getDb } from './client';
import { generateReferralCode, normalizeReferralCode } from '../referral';
import { getTeamCreditSettings } from '../services/settings-service';
import { getAmbassadorByCode, isMissingReferralTableError } from './ambassadors';
import { getCourseById } from './courses';
import { getEnrollmentById } from './enrollments';
import { getTeamAccessById, listTeamAccess } from './team';
import { getUserById } from './users';
import {
  mapTeamCreditLedgerRow,
  mapTeamRedemptionRow,
  mapTeamReferralAttributionRow,
  mapTeamReferralCodeRow,
} from './mappers';
import type {
  TeamCreditLedgerEntry,
  TeamGoody,
  TeamRedemption,
  TeamReferralAttribution,
  TeamReferralCode,
} from './types';

const TEAM_CREDIT_TABLES = ['TeamReferralCode', 'TeamReferralAttribution', 'TeamCreditLedger', 'TeamRedemption'];

/** True when the error is "relation does not exist" for one of the credit tables (migration not run yet). */
export function isMissingTeamCreditTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  const namesTable = TEAM_CREDIT_TABLES.some((t) => text.includes(t));
  if (code === '42P01' && namesTable) return true;
  return /relation .* does not exist/i.test(text) && namesTable;
}

export const TEAM_CREDIT_TABLE_MISSING_MESSAGE =
  'The team credit tables are not set up yet — run codebettle-team-credits-migration.sql in the Supabase SQL Editor first.';

/** Cheap probe: true when the TeamReferralCode table exists (migration has run). */
export async function isTeamCreditTableReady(): Promise<boolean> {
  try {
    await getDb().orm.public.TeamReferralCode.orderBy((c) => c.createdAt.desc()).limit(1).all();
    return true;
  } catch (error) {
    if (isMissingTeamCreditTableError(error)) return false;
    throw error;
  }
}

/** A read that returns the fallback when a credit table is missing, instead of throwing. */
async function withTeamCreditTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingTeamCreditTableError(error)) return fallback;
    throw error;
  }
}

function throwIfTableMissing(error: unknown): never {
  if (isMissingTeamCreditTableError(error)) {
    throw new Error(TEAM_CREDIT_TABLE_MISSING_MESSAGE);
  }
  throw error;
}

// ---------------------------------------------------------------------------
// Referral codes
// ---------------------------------------------------------------------------

/**
 * A fresh team referral code that NO referrer holds yet — neither a
 * team member nor an ambassador. Regenerates on collision (10 tries —
 * with 32^6 combinations a collision is already near-impossible; the
 * DB unique constraints are the backstop). `rand` is injectable for
 * tests (defaults to crypto.randomInt).
 */
export async function generateUniqueTeamReferralCode(
  rand?: (min: number, max: number) => number,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateReferralCode(rand);
    const [team, ambassador] = await Promise.all([
      getTeamReferralCodeByCode(code),
      getAmbassadorByCode(code),
    ]);
    if (!team && !ambassador) return code;
  }
  throw new Error('Could not generate a unique referral code — please try again.');
}

export async function getTeamReferralCodeByCode(code: string): Promise<TeamReferralCode | null> {
  const normalized = normalizeReferralCode(code);
  return withTeamCreditTableFallback(async () => {
    const row = await getDb().orm.public.TeamReferralCode.where({ code: normalized }).first();
    if (!row) return null;
    return mapTeamReferralCodeRow(row as never);
  }, null);
}

export async function getTeamReferralCodeByTeamAccessId(teamAccessId: string): Promise<TeamReferralCode | null> {
  return withTeamCreditTableFallback(async () => {
    const row = await getDb().orm.public.TeamReferralCode.where({ teamAccessId }).first();
    if (!row) return null;
    return mapTeamReferralCodeRow(row as never);
  }, null);
}

/** All referral codes (admin). Empty when the table is missing. */
export async function listTeamReferralCodes(): Promise<TeamReferralCode[]> {
  return withTeamCreditTableFallback(async () => {
    const rows = await getDb().orm.public.TeamReferralCode.orderBy((c) => c.createdAt.desc()).all();
    return rows.map((r) => mapTeamReferralCodeRow(r as never));
  }, []);
}

/**
 * Mint (or return the existing) referral code for a team member.
 * Idempotent by teamAccessId: calling it twice returns the same code.
 * A grant whose member never opens the portal still gets a code via
 * the admin backfill below.
 */
export async function ensureTeamReferralCode(
  teamAccessId: string,
  rand?: (min: number, max: number) => number,
): Promise<TeamReferralCode> {
  const existing = await getTeamReferralCodeByTeamAccessId(teamAccessId);
  if (existing) return existing;
  try {
    const code = await generateUniqueTeamReferralCode(rand);
    const row = await getDb().orm.public.TeamReferralCode.create({ teamAccessId, code });
    return mapTeamReferralCodeRow(row as never);
  } catch (error) {
    if (isMissingTeamCreditTableError(error)) throw new Error(TEAM_CREDIT_TABLE_MISSING_MESSAGE);
    // Race backstop: a concurrent mint for the same member — re-read
    // and return the winner instead of a raw 500.
    if (error instanceof Error && /duplicate key value violates unique constraint/i.test(error.message)) {
      const winner = await getTeamReferralCodeByTeamAccessId(teamAccessId);
      if (winner) return winner;
    }
    throw error;
  }
}

/**
 * Backfill: every ACTIVE team grant gets a referral code. Idempotent
 * — already-covered grants are skipped. Called (best-effort) when the
 * admin Credits Management page loads, so members granted before this
 * feature shipped get codes without Eman running anything extra.
 * Returns how many codes were created.
 */
export async function backfillTeamReferralCodes(): Promise<number> {
  let created = 0;
  const grants = await listTeamAccess();
  for (const grant of grants) {
    if (grant.status !== 'active') continue;
    const before = await getTeamReferralCodeByTeamAccessId(grant.id);
    if (before) continue;
    try {
      await ensureTeamReferralCode(grant.id);
      created += 1;
    } catch (error) {
      // One bad grant must not stop the rest; the member's own
      // credits page retries the mint on their next visit.
      console.error('[team-credits] Failed to mint referral code for team grant', grant.id, error);
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// Referral attribution (who signed up via whose team link)
// ---------------------------------------------------------------------------

export async function getTeamReferralAttributionByUserId(userId: string): Promise<TeamReferralAttribution | null> {
  return withTeamCreditTableFallback(async () => {
    const row = await getDb().orm.public.TeamReferralAttribution.where({ userId }).first();
    if (!row) return null;
    return mapTeamReferralAttributionRow(row as never);
  }, null);
}

/** Everyone one team member referred, newest first. Empty when the table is missing. */
export async function listTeamReferralAttributionsForMember(teamAccessId: string): Promise<TeamReferralAttribution[]> {
  return withTeamCreditTableFallback(async () => {
    const rows = await getDb()
      .orm.public.TeamReferralAttribution.where({ teamAccessId })
      .orderBy((a) => a.createdAt.desc())
      .all();
    return rows.map((r) => mapTeamReferralAttributionRow(r as never));
  }, []);
}

/**
 * Resolve a referral code for a signup — the TEAM half of the shared
 * `?ref=` capture. Returns the teamAccessId to attribute, or null
 * when the code is not a team code / the grant is not active / the
 * registering email IS the team member's own email (self-referral is
 * impossible by construction, and this guard makes it impossible
 * even if the cookie is planted).
 */
export async function resolveTeamReferralForSignup(code: string, email: string): Promise<string | null> {
  if (!code) return null;
  const row = await getTeamReferralCodeByCode(code);
  if (!row) return null;
  const access = await getTeamAccessById(row.teamAccessId);
  if (!access || access.status !== 'active') return null;
  if (access.email === email.trim().toLowerCase()) return null;
  return access.id;
}

/**
 * Store the referrer for a newly registered user — server-side only.
 * Called from registerUser with the team access id resolved from the
 * `cb_ref` cookie (never a client-sent field). Best-effort: a missing
 * table or a duplicate (the user already attributed) must never fail
 * signup — returns false in both cases. One user, one referrer: an
 * existing ambassador attribution wins over a team one.
 */
export async function attributeSignupToTeamMember(teamAccessId: string, userId: string): Promise<boolean> {
  try {
    const access = await getTeamAccessById(teamAccessId);
    if (!access || access.status !== 'active') return false;
    const existing = await getTeamReferralAttributionByUserId(userId);
    if (existing) return false;
    // An ambassador attribution for the same user wins — the cookie
    // holds a single code, so this is a backstop, not a normal path.
    // A missing ambassador table (their SQL not run yet) means there
    // is no ambassador attribution to defer to.
    try {
      const ambassadorAttribution = await getDb().orm.public.ReferralAttribution.where({ userId }).first();
      if (ambassadorAttribution) return false;
    } catch (error) {
      if (!isMissingReferralTableError(error)) throw error;
    }
    await getDb().orm.public.TeamReferralAttribution.create({ teamAccessId, userId });
    return true;
  } catch (error) {
    if (isMissingTeamCreditTableError(error)) return false;
    if (error instanceof Error && /duplicate key value violates unique constraint/i.test(error.message)) {
      return false;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Ledger — balance is SUM(amount); there is no balance column.
// ---------------------------------------------------------------------------

/** All ledger entries, newest first. Empty when the table is missing. */
export async function listTeamCreditLedger(teamAccessId?: string): Promise<TeamCreditLedgerEntry[]> {
  return withTeamCreditTableFallback(async () => {
    const query = teamAccessId
      ? getDb().orm.public.TeamCreditLedger.where({ teamAccessId })
      : getDb().orm.public.TeamCreditLedger;
    const rows = await query.orderBy((e) => e.createdAt.desc()).all();
    return rows.map((r) => mapTeamCreditLedgerRow(r as never));
  }, []);
}

/** One member's ledger, newest first. Empty when the table is missing. */
export async function listTeamCreditLedgerForMember(teamAccessId: string): Promise<TeamCreditLedgerEntry[]> {
  return listTeamCreditLedger(teamAccessId);
}

/** One member's balance = SUM(amount) over their ledger rows. 0 when the table is missing. */
export async function getTeamCreditBalance(teamAccessId: string): Promise<number> {
  const entries = await listTeamCreditLedgerForMember(teamAccessId);
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

/** Balances for several members in one ledger read. Unknown ids (or a missing table) map to 0. */
export async function getTeamCreditBalances(teamAccessIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const id of teamAccessIds) out.set(id, 0);
  if (teamAccessIds.length === 0) return out;
  const entries = await listTeamCreditLedger();
  for (const entry of entries) {
    if (!out.has(entry.teamAccessId)) continue;
    out.set(entry.teamAccessId, out.get(entry.teamAccessId)! + entry.amount);
  }
  return out;
}

/**
 * Balance breakdown for one member: available balance (holds already
 * subtracted — a pending redemption's credits are NOT spendable),
 * credits currently held by pending redemptions, and total earned.
 */
export async function getTeamCreditSummary(teamAccessId: string): Promise<{
  balance: number;
  held: number;
  earned: number;
}> {
  const [entries, redemptions] = await Promise.all([
    listTeamCreditLedgerForMember(teamAccessId),
    listTeamRedemptionsForMember(teamAccessId),
  ]);
  const balance = entries.reduce((sum, e) => sum + e.amount, 0);
  const earned = entries.filter((e) => e.kind === 'earn').reduce((sum, e) => sum + e.amount, 0);
  const held = redemptions
    .filter((r) => r.status === 'pending')
    .reduce((sum, r) => sum + r.creditsSpent, 0);
  return { balance, held, earned };
}

async function getLedgerEntryByKindAndReference(
  kind: 'earn' | 'hold' | 'release',
  referenceId: string,
): Promise<TeamCreditLedgerEntry | null> {
  return withTeamCreditTableFallback(async () => {
    const row = await getDb()
      .orm.public.TeamCreditLedger.where({ kind, referenceId })
      .first();
    if (!row) return null;
    return mapTeamCreditLedgerRow(row as never);
  }, null);
}

/**
 * Award credits for an enrollment — the single choke point for ALL
 * credit earning. Best-effort and NEVER throws: a failure must never
 * break enrollment creation or payment approval.
 *
 * - trigger 'enrollment': award when the admin setting says credits
 *   are earned on enrollment. When the setting says 'approved_payment',
 *   a FREE-course enrollment still awards here — there is no payment
 *   to wait for, so waiting would mean free courses never earn.
 * - trigger 'payment': award only when the setting says
 *   'approved_payment' AND the enrollment is paid.
 *
 * Idempotent: one earn entry per enrollment, ever (explicit check +
 * the (kind, referenceId) unique constraint as backstop). The amount
 * is read from the live admin setting at award time.
 */
export async function maybeAwardTeamCreditsForEnrollment(
  enrollmentId: string,
  trigger: 'enrollment' | 'payment',
): Promise<boolean> {
  try {
    const enrollment = await getEnrollmentById(enrollmentId);
    if (!enrollment) return false;
    const attribution = await getTeamReferralAttributionByUserId(enrollment.studentId);
    if (!attribution) return false;
    const settings = await getTeamCreditSettings();
    if (trigger === 'enrollment') {
      if (settings.earnOn === 'approved_payment' && enrollment.paymentStatus !== 'free') return false;
    } else {
      if (settings.earnOn !== 'approved_payment') return false;
      if (enrollment.paymentStatus !== 'paid') return false;
    }
    const amount = settings.creditsPerEnrollment;
    if (!Number.isInteger(amount) || amount <= 0) return false;
    const existing = await getLedgerEntryByKindAndReference('earn', enrollmentId);
    if (existing) return false;
    // A human-readable line for the history view (best-effort — the
    // entry is valid without it).
    let note: string | undefined;
    try {
      const [student, course] = await Promise.all([
        getUserById(enrollment.studentId),
        getCourseById(enrollment.courseId),
      ]);
      if (student && course) note = `${student.name} enrolled in ${course.title}`;
    } catch {
      note = undefined;
    }
    try {
      await getDb().orm.public.TeamCreditLedger.create({
        teamAccessId: attribution.teamAccessId,
        kind: 'earn',
        amount,
        referenceId: enrollmentId,
        note: note ?? null,
      });
      return true;
    } catch (error) {
      if (error instanceof Error && /duplicate key value violates unique constraint/i.test(error.message)) {
        return false;
      }
      throw error;
    }
  } catch (error) {
    if (isMissingTeamCreditTableError(error)) return false;
    console.error('[team-credits] Failed to award credits for enrollment', enrollmentId, error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Redemptions
// ---------------------------------------------------------------------------

/** All redemptions, newest first. Empty when the table is missing. */
export async function listTeamRedemptions(): Promise<TeamRedemption[]> {
  return withTeamCreditTableFallback(async () => {
    const rows = await getDb().orm.public.TeamRedemption.orderBy((r) => r.requestedAt.desc()).all();
    return rows.map((r) => mapTeamRedemptionRow(r as never));
  }, []);
}

/** One member's redemptions, newest first. Empty when the table is missing. */
export async function listTeamRedemptionsForMember(teamAccessId: string): Promise<TeamRedemption[]> {
  return withTeamCreditTableFallback(async () => {
    const rows = await getDb()
      .orm.public.TeamRedemption.where({ teamAccessId })
      .orderBy((r) => r.requestedAt.desc())
      .all();
    return rows.map((r) => mapTeamRedemptionRow(r as never));
  }, []);
}

export async function getTeamRedemptionById(id: string): Promise<TeamRedemption | null> {
  return withTeamCreditTableFallback(async () => {
    const row = await getDb().orm.public.TeamRedemption.where({ id }).first();
    if (!row) return null;
    return mapTeamRedemptionRow(row as never);
  }, null);
}

/**
 * Request a goody. Holds the credits immediately (a ledger hold
 * entry), so the same credits cannot be spent twice. Returns the
 * redemption, or an error string the route can show as-is (not
 * enough credits, goody unpriced, not a team member).
 *
 * Double-spend guard: after creating the hold, the balance is
 * re-read — if it went negative (two requests racing the same
 * credits), the request is rolled back (hold + redemption deleted)
 * and refused. A perfect race fails BOTH requests and the member
 * retries; credits can never go negative.
 */
export async function requestTeamRedemption(
  teamAccessId: string,
  goody: TeamGoody,
): Promise<{ redemption: TeamRedemption } | { error: string }> {
  const settings = await getTeamCreditSettings();
  const price = settings.goodyPrices[goody];
  if (!Number.isInteger(price) || price <= 0) {
    return { error: 'This goody has no credit price yet — an admin sets its price in Credits Management first.' };
  }
  const access = await getTeamAccessById(teamAccessId);
  if (!access || access.status !== 'active') return { error: 'Team access required' };
  const balance = await getTeamCreditBalance(teamAccessId);
  if (balance < price) {
    return { error: `Not enough credits — this goody costs ${price} credits and the balance is ${balance}.` };
  }
  try {
    const row = await getDb().orm.public.TeamRedemption.create({
      teamAccessId,
      goody,
      creditsSpent: price,
      status: 'pending',
    });
    const redemption = mapTeamRedemptionRow(row as never);
    let holdId: string | null = null;
    try {
      const hold = await getDb().orm.public.TeamCreditLedger.create({
        teamAccessId,
        kind: 'hold',
        amount: -price,
        referenceId: redemption.id,
        note: `Hold: ${goody} redemption requested`,
      });
      holdId = (hold as { id: string }).id;
    } catch (error) {
      // The hold is the whole point — without it the credits could be
      // spent twice. Delete the redemption and refuse.
      try {
        await getDb().orm.public.TeamRedemption.where({ id: redemption.id }).delete();
      } catch {
        // Best-effort cleanup; the redemption stays pending without a
        // hold, which the admin page surfaces (a pending redemption
        // with no hold is visible in the ledger view).
        console.error('[team-credits] Redemption created but hold failed and cleanup failed', redemption.id, error);
      }
      throwIfTableMissing(error);
      return { error: 'Could not hold the credits — please try again.' };
    }
    const after = await getTeamCreditBalance(teamAccessId);
    if (after < 0) {
      // Two requests raced the same credits — roll this one back.
      try {
        if (holdId) await getDb().orm.public.TeamCreditLedger.where({ id: holdId }).delete();
        await getDb().orm.public.TeamRedemption.where({ id: redemption.id }).delete();
      } catch (error) {
        console.error('[team-credits] Rollback of a raced redemption failed', redemption.id, error);
      }
      return { error: 'Not enough credits — another request used them first. Please try again.' };
    }
    return { redemption };
  } catch (error) {
    if (isMissingTeamCreditTableError(error)) throw new Error(TEAM_CREDIT_TABLE_MISSING_MESSAGE);
    throw error;
  }
}

/**
 * Decide a pending redemption (admin). Approve: the hold IS the
 * deduction — no new ledger entry; the redemption flips to approved.
 * Reject: a release entry returns the held credits. The status flip
 * is a conditional update (status must still be pending), which
 * closes the double-decide race. Returns the updated redemption, or
 * null when it is not pending (already decided).
 *
 * Repair: deciding an already-REJECTED redemption whose release entry
 * is missing (a failed release at decide time) creates the release
 * instead of returning null — so "run the reject again" repairs it.
 */
export async function decideTeamRedemption(
  id: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
): Promise<TeamRedemption | null> {
  const redemption = await getTeamRedemptionById(id);
  if (!redemption) return null;
  if (redemption.status === 'rejected' && decision === 'rejected') {
    const release = await getLedgerEntryByKindAndReference('release', id);
    if (!release) {
      try {
        await getDb().orm.public.TeamCreditLedger.create({
          teamAccessId: redemption.teamAccessId,
          kind: 'release',
          amount: redemption.creditsSpent,
          referenceId: id,
          note: `Released: ${redemption.goody} redemption rejected`,
        });
      } catch (error) {
        throwIfTableMissing(error);
      }
    }
    return redemption;
  }
  if (redemption.status !== 'pending') return null;
  try {
    const updated = await getDb()
      .orm.public.TeamRedemption.where({ id })
      .where((r) => r.status.eq('pending'))
      .update({ status: decision, decidedAt: new Date(), decidedBy });
    if (!updated) return null;
    const decided = mapTeamRedemptionRow(updated as never);
    if (decision === 'rejected') {
      const existing = await getLedgerEntryByKindAndReference('release', id);
      if (!existing) {
        try {
          await getDb().orm.public.TeamCreditLedger.create({
            teamAccessId: redemption.teamAccessId,
            kind: 'release',
            amount: redemption.creditsSpent,
            referenceId: id,
            note: `Released: ${redemption.goody} redemption rejected`,
          });
        } catch (error) {
          // The redemption IS rejected; the release failed. Log loudly
          // — deciding it rejected again repairs the missing release
          // (see the repair path above).
          console.error('[team-credits] Redemption rejected but credit release failed', id, error);
        }
      }
    }
    return decided;
  } catch (error) {
    throwIfTableMissing(error);
  }
}
