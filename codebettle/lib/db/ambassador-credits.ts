/**
 * Ambassador Credit System repository (Eman, 20 Nov 2026).
 *
 * 100 credits per referred student (Eman's number), awarded on the
 * referred student's FIRST enrollment — never for signups alone
 * (signup-only awards are farmable), never per enrollment (one
 * student enrolling in five courses still earns 100, exactly once).
 * The ambassador's code is ALSO a coupon: Rs 200 off per enrollment,
 * computed server-side at payment creation (P-3 rule) — the code IS
 * a Coupon row (type fixed, value 200), created/kept canonical here.
 *
 * LEDGER (append-only — there is NO balance column anywhere):
 * - earn: +100 when a referred student enrolls for the first time,
 *   referenceId = the referred student's userId. One earn per
 *   student, ever (explicit check + the (kind, referenceId) unique
 *   constraint as backstop).
 * A member's balance is SUM(amount) over their ledger rows. Only
 * 'earn' exists in v1 — redemption (hold/release) is a later
 * decision for Eman (see the brief); the balance shown to the
 * ambassador is the earn total until then.
 *
 * FAIL-SAFE (same shape as lib/db/team-credits.ts): the
 * AmbassadorCreditLedger table exists only after Eman runs
 * codebettle-ambassador-credits-migration.sql (migration
 * 20261120T1608_add_ambassador_credits). Until then every read
 * returns its empty fallback, attribution lookups return null, and
 * award calls return false — the dashboard shows 0 credits with a
 * "not set up yet" note, and registration/enrollment/payment work
 * exactly as before. No existing table is touched.
 *
 * The Coupon table itself is old (Phase 2) — the coupon ensure below
 * needs no fail-safe. It is best-effort by design: a coupon that
 * fails to sync on one call is repaired by the Referral Codes page
 * backfill on the next admin visit, so a transient failure never
 * blocks an approval or a grant.
 */
import { getDb } from './client';
import { AMBASSADOR_CREDITS_PER_REFERRAL, AMBASSADOR_REFERRAL_DISCOUNT_PKR } from '../referral';
import { getAmbassadorById, isMissingReferralTableError } from './ambassadors';
import { getCourseById } from './courses';
import { getEnrollmentById } from './enrollments';
import { getUserById } from './users';
import { createCoupon, getCouponByCode, updateCouponByCode } from './coupons';
import { mapAmbassadorCreditLedgerRow } from './mappers';
import type { AmbassadorCreditLedgerEntry, Coupon } from './types';

const AMBASSADOR_CREDIT_TABLES = ['AmbassadorCreditLedger'];

/** The coupon's use cap — effectively unlimited, but the column is NOT NULL. */
export const AMBASSADOR_COUPON_MAX_USES = 1_000_000;

/** How long an ambassador's coupon stays valid from creation (years). */
export const AMBASSADOR_COUPON_VALID_YEARS = 10;

/** True when the error is "relation does not exist" for the credit table (migration not run yet). */
export function isMissingAmbassadorCreditTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  const namesTable = AMBASSADOR_CREDIT_TABLES.some((t) => text.includes(t));
  if (code === '42P01' && namesTable) return true;
  return /relation .* does not exist/i.test(text) && namesTable;
}

export const AMBASSADOR_CREDIT_TABLE_MISSING_MESSAGE =
  'The ambassador credit table is not set up yet — run codebettle-ambassador-credits-migration.sql in the Supabase SQL Editor first.';

/** Cheap probe: true when the AmbassadorCreditLedger table exists (migration has run). */
export async function isAmbassadorCreditTableReady(): Promise<boolean> {
  try {
    await getDb().orm.public.AmbassadorCreditLedger.orderBy((e) => e.createdAt.desc()).limit(1).all();
    return true;
  } catch (error) {
    if (isMissingAmbassadorCreditTableError(error)) return false;
    throw error;
  }
}

/** A read that returns the fallback when the credit table is missing, instead of throwing. */
async function withAmbassadorCreditTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingAmbassadorCreditTableError(error)) return fallback;
    throw error;
  }
}

function throwIfTableMissing(error: unknown): never {
  if (isMissingAmbassadorCreditTableError(error)) {
    throw new Error(AMBASSADOR_CREDIT_TABLE_MISSING_MESSAGE);
  }
  throw error;
}

// ---------------------------------------------------------------------------
// Coupon — the ambassador's code IS a Coupon row (Rs 200, fixed)
// ---------------------------------------------------------------------------

/**
 * The canonical coupon for an ambassador code: type fixed, value
 * AMBASSADOR_REFERRAL_DISCOUNT_PKR (200), active, applies to every
 * course. Creates it when missing; repairs it when a previous row
 * drifted (wrong value/type, deactivated, expired) — the invariant
 * "code == Rs 200 coupon" always holds after this call. Returns the
 * coupon, or null when the coupon write failed (best-effort: the
 * Referral Codes page backfill retries it).
 */
export async function ensureAmbassadorCoupon(code: string): Promise<Coupon | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  try {
    const existing = await getCouponByCode(normalized);
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + AMBASSADOR_COUPON_VALID_YEARS);
    if (!existing) {
      return await createCoupon({
        code: normalized,
        type: 'fixed',
        value: AMBASSADOR_REFERRAL_DISCOUNT_PKR,
        maxUses: AMBASSADOR_COUPON_MAX_USES,
        expiresAt,
        applicableCourses: [],
      });
    }
    const needsRepair =
      existing.type !== 'fixed' ||
      existing.value !== AMBASSADOR_REFERRAL_DISCOUNT_PKR ||
      !existing.isActive ||
      new Date(existing.expiresAt).getTime() < Date.now();
    if (!needsRepair) return existing;
    return await updateCouponByCode(normalized, {
      type: 'fixed',
      value: AMBASSADOR_REFERRAL_DISCOUNT_PKR,
      maxUses: Math.max(existing.maxUses, AMBASSADOR_COUPON_MAX_USES),
      expiresAt,
      isActive: true,
      applicableCourses: [],
    });
  } catch (error) {
    console.error('[ambassador-credits] Failed to ensure coupon for code', normalized, error);
    return null;
  }
}

/** Deactivate the coupon of a code that was changed away or whose ambassador was deactivated. */
export async function deactivateAmbassadorCoupon(code: string): Promise<void> {
  try {
    await updateCouponByCode(code, { isActive: false });
  } catch (error) {
    console.error('[ambassador-credits] Failed to deactivate coupon for code', code, error);
  }
}

/**
 * Backfill: every ambassador's code gets its canonical coupon row.
 * Idempotent — already-correct coupons are left alone. Called
 * (best-effort) when the admin Referral Codes page loads, so codes
 * that predate this redesign (Eman's FG2SZU, Areeba's U5W5GK) get
 * their Rs 200 coupon without anyone running anything extra.
 * Returns how many coupons were created or repaired.
 */
export async function ensureAmbassadorCouponsForAll(ambassadorCodes: string[]): Promise<number> {
  let synced = 0;
  for (const code of ambassadorCodes) {
    try {
      const before = await getCouponByCode(code);
      const after = await ensureAmbassadorCoupon(code);
      if (after && (!before || before.type !== 'fixed' || before.value !== AMBASSADOR_REFERRAL_DISCOUNT_PKR || !before.isActive)) {
        synced += 1;
      }
    } catch (error) {
      // One bad code must not stop the rest; the next page load retries it.
      console.error('[ambassador-credits] Failed to sync coupon for code', code, error);
    }
  }
  return synced;
}

// ---------------------------------------------------------------------------
// Ledger — balance is SUM(amount); there is no balance column.
// ---------------------------------------------------------------------------

/** All ledger entries, newest first. Empty when the table is missing. */
export async function listAmbassadorCreditLedger(ambassadorId?: string): Promise<AmbassadorCreditLedgerEntry[]> {
  return withAmbassadorCreditTableFallback(async () => {
    const query = ambassadorId
      ? getDb().orm.public.AmbassadorCreditLedger.where({ ambassadorId })
      : getDb().orm.public.AmbassadorCreditLedger;
    const rows = await query.orderBy((e) => e.createdAt.desc()).all();
    return rows.map((r) => mapAmbassadorCreditLedgerRow(r as never));
  }, []);
}

/** One ambassador's ledger, newest first. Empty when the table is missing. */
export async function listAmbassadorCreditLedgerForAmbassador(ambassadorId: string): Promise<AmbassadorCreditLedgerEntry[]> {
  return listAmbassadorCreditLedger(ambassadorId);
}

/** One ambassador's balance = SUM(amount) over their ledger rows. 0 when the table is missing. */
export async function getAmbassadorCreditBalance(ambassadorId: string): Promise<number> {
  const entries = await listAmbassadorCreditLedgerForAmbassador(ambassadorId);
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

/** Balances for several ambassadors in one ledger read. Unknown ids (or a missing table) map to 0. */
export async function getAmbassadorCreditBalances(ambassadorIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const id of ambassadorIds) out.set(id, 0);
  if (ambassadorIds.length === 0) return out;
  const entries = await listAmbassadorCreditLedger();
  for (const entry of entries) {
    if (!out.has(entry.ambassadorId)) continue;
    out.set(entry.ambassadorId, out.get(entry.ambassadorId)! + entry.amount);
  }
  return out;
}

/** Balance + total earned for one ambassador (identical in v1 — only 'earn' exists). */
export async function getAmbassadorCreditSummary(ambassadorId: string): Promise<{ balance: number; earned: number }> {
  const entries = await listAmbassadorCreditLedgerForAmbassador(ambassadorId);
  const balance = entries.reduce((sum, e) => sum + e.amount, 0);
  const earned = entries.filter((e) => e.kind === 'earn').reduce((sum, e) => sum + e.amount, 0);
  return { balance, earned };
}

async function getLedgerEntryByKindAndReference(
  kind: 'earn',
  referenceId: string,
): Promise<AmbassadorCreditLedgerEntry | null> {
  return withAmbassadorCreditTableFallback(async () => {
    const row = await getDb()
      .orm.public.AmbassadorCreditLedger.where({ kind, referenceId })
      .first();
    if (!row) return null;
    return mapAmbassadorCreditLedgerRow(row as never);
  }, null);
}

/**
 * Award credits for an enrollment — the single choke point for ALL
 * ambassador credit earning. Best-effort and NEVER throws: a failure
 * must never break enrollment creation.
 *
 * Awarded on the referred student's FIRST enrollment, ever: the
 * attribution is looked up by the enrolled student, the earn entry's
 * referenceId is the student's userId (not the enrollment id), so a
 * second enrollment by the same student finds the existing entry and
 * awards nothing. The amount is Eman's constant (100) — never a
 * setting, never a client value.
 */
export async function maybeAwardAmbassadorCreditsForEnrollment(enrollmentId: string): Promise<boolean> {
  try {
    const enrollment = await getEnrollmentById(enrollmentId);
    if (!enrollment) return false;
    const attribution = await getDb().orm.public.ReferralAttribution.where({ userId: enrollment.studentId }).first();
    if (!attribution) return false;
    const ambassador = await getAmbassadorById(attribution.ambassadorId as string);
    if (!ambassador || ambassador.status !== 'active') return false;
    const amount = AMBASSADOR_CREDITS_PER_REFERRAL;
    if (!Number.isInteger(amount) || amount <= 0) return false;
    const existing = await getLedgerEntryByKindAndReference('earn', enrollment.studentId);
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
      await getDb().orm.public.AmbassadorCreditLedger.create({
        ambassadorId: ambassador.id,
        kind: 'earn',
        amount,
        referenceId: enrollment.studentId,
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
    if (isMissingAmbassadorCreditTableError(error) || isMissingReferralTableError(error)) return false;
    console.error('[ambassador-credits] Failed to award credits for enrollment', enrollmentId, error);
    return false;
  }
}
