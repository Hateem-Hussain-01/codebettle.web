/**
 * Ambassador repository — referral tracking (Eman, 16 Nov 2026).
 *
 * One row per approved ambassador (random 10-char referral code),
 * referral clicks, referral attribution (who signed up via whose
 * link), the 4-stage stats, the ambassador's own group link +
 * daily member count, and one-way messages to the admin.
 *
 * FAIL-SAFE (same shape as lib/db/ambassador-applications.ts): the
 * Ambassador / ReferralAttribution / ReferralClick /
 * AmbassadorMessage tables arrive via migration
 * 20261115T2118_add_ambassador_referral_tracking, which Eman runs
 * himself in the Supabase SQL Editor. Until it runs, reads return
 * empty (dashboards/admin show a "run the SQL" state) and writes
 * return a clear error telling the admin to run the SQL first. No
 * existing table is touched by this feature — attribution lives in
 * its own table, NOT as a column on User (a new User column would
 * be selected by every user read, login included, so the whole site
 * would 42703 until the SQL runs; see the PR body).
 *
 * Counting rules (the 4 stages, derived from source tables — no
 * separate counters that can drift):
 * - clicks: DISTINCT (ambassador, ip, UTC day) from ReferralClick
 *   rows — refreshing the link cannot inflate the number.
 * - signups: ReferralAttribution rows for the ambassador.
 * - enrollments: Enrollment rows of the referred users.
 * - payments: APPROVED PaymentSubmission rows of the referred
 *   users' enrollments (an approval flips the enrollment to paid,
 *   so the two agree; the submission is the payment itself).
 * Team stages per member: 'signed up' (account only), 'enrolled'
 * (>= 1 enrollment), 'paid' (>= 1 approved payment submission or
 * an enrollment with paymentStatus 'paid').
 */
import { getDb } from './client';
import { mapAmbassadorMessageRow, mapAmbassadorRow } from './mappers';
import { generateReferralCode, normalizeReferralCode, utcDayString } from '../referral';
import { listAmbassadorApplications } from './ambassador-applications';
import { getUserByEmail } from './users';
import type {
  Ambassador,
  AmbassadorMessage,
  AmbassadorStatus,
  AmbassadorWithStats,
  ReferralStats,
  ReferralTeamMember,
} from './types';

const REFERRAL_TABLES = ['Ambassador', 'ReferralAttribution', 'ReferralClick', 'AmbassadorMessage'];

/** True when the error is "relation does not exist" for one of the referral tables (migration not run yet). */
export function isMissingReferralTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  const namesTable = REFERRAL_TABLES.some((t) => text.includes(t));
  if (code === '42P01' && namesTable) return true;
  return /relation .* does not exist/i.test(text) && namesTable;
}

export const AMBASSADOR_TABLE_MISSING_MESSAGE =
  'The ambassador referral tables are not set up yet — run codebettle-ambassador-referral-migration.sql in the Supabase SQL Editor first.';

/** Cheap probe: true when the Ambassador table exists (migration has run). */
export async function isAmbassadorTableReady(): Promise<boolean> {
  try {
    await getDb().orm.public.Ambassador.orderBy((a) => a.createdAt.desc()).limit(1).all();
    return true;
  } catch (error) {
    if (isMissingReferralTableError(error)) return false;
    throw error;
  }
}

/** A read that returns the fallback when a referral table is missing, instead of throwing. */
async function withReferralTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingReferralTableError(error)) return fallback;
    throw error;
  }
}

function throwIfTableMissing(error: unknown): never {
  if (isMissingReferralTableError(error)) {
    throw new Error(AMBASSADOR_TABLE_MISSING_MESSAGE);
  }
  throw error;
}

export const EMPTY_REFERRAL_STATS: ReferralStats = { clicks: 0, signups: 0, enrollments: 0, payments: 0 };

function emptyStatsResult(): { stats: ReferralStats; teamLevel1: ReferralTeamMember[]; teamLevel2: ReferralTeamMember[] } {
  return { stats: { ...EMPTY_REFERRAL_STATS }, teamLevel1: [], teamLevel2: [] };
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

/**
 * A fresh referral code that no ambassador holds yet. Regenerates on
 * collision (10 tries — with 32^10 combinations a collision is
 * already near-impossible; the DB unique constraint is the backstop).
 * `rand` is injectable for tests (defaults to crypto.randomInt).
 */
export async function generateUniqueReferralCode(
  rand?: (min: number, max: number) => number,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateReferralCode(rand);
    const existing = await getAmbassadorByCode(code);
    if (!existing) return code;
  }
  throw new Error('Could not generate a unique referral code — please try again.');
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getAmbassadorById(id: string): Promise<Ambassador | null> {
  return withReferralTableFallback(async () => {
    const row = await getDb().orm.public.Ambassador.where({ id }).first();
    if (!row) return null;
    return mapAmbassadorRow(row as never);
  }, null);
}

export async function getAmbassadorByCode(code: string): Promise<Ambassador | null> {
  const normalized = normalizeReferralCode(code);
  return withReferralTableFallback(async () => {
    const row = await getDb().orm.public.Ambassador.where({ referralCode: normalized }).first();
    if (!row) return null;
    return mapAmbassadorRow(row as never);
  }, null);
}

export async function getAmbassadorByEmail(email: string): Promise<Ambassador | null> {
  const normalized = email.trim().toLowerCase();
  return withReferralTableFallback(async () => {
    const row = await getDb().orm.public.Ambassador.where({ email: normalized }).first();
    if (!row) return null;
    return mapAmbassadorRow(row as never);
  }, null);
}

export async function getAmbassadorByUserId(userId: string): Promise<Ambassador | null> {
  return withReferralTableFallback(async () => {
    const row = await getDb().orm.public.Ambassador.where({ userId }).first();
    if (!row) return null;
    return mapAmbassadorRow(row as never);
  }, null);
}

export async function getAmbassadorByApplicationId(applicationId: string): Promise<Ambassador | null> {
  return withReferralTableFallback(async () => {
    const row = await getDb().orm.public.Ambassador.where({ applicationId }).first();
    if (!row) return null;
    return mapAmbassadorRow(row as never);
  }, null);
}

/** All ambassadors, newest first (admin). Empty when the table is missing. */
export async function listAmbassadors(): Promise<Ambassador[]> {
  return withReferralTableFallback(async () => {
    const rows = await getDb().orm.public.Ambassador.orderBy((a) => a.createdAt.desc()).all();
    return rows.map((r) => mapAmbassadorRow(r as never));
  }, []);
}

// ---------------------------------------------------------------------------
// Writes — ambassadors
// ---------------------------------------------------------------------------

export interface CreateAmbassadorInput {
  email: string;
  applicationId?: string;
  userId?: string;
}

/**
 * Create an approved ambassador with a fresh random referral code.
 * Idempotent by email: an existing ambassador for the email is
 * returned instead of a duplicate (the approve flow and the
 * direct-grant flow can both run for the same person).
 */
export async function createAmbassador(input: CreateAmbassadorInput): Promise<Ambassador> {
  const email = input.email.trim().toLowerCase();
  const existing = await getAmbassadorByEmail(email);
  if (existing) return existing;
  try {
    const referralCode = await generateUniqueReferralCode();
    const row = await getDb().orm.public.Ambassador.create({
      applicationId: input.applicationId ?? null,
      userId: input.userId ?? null,
      email,
      referralCode,
      status: 'active',
    });
    return mapAmbassadorRow(row as never);
  } catch (error) {
    if (isMissingReferralTableError(error)) throw new Error(AMBASSADOR_TABLE_MISSING_MESSAGE);
    // Race backstop: a concurrent create for the same email/code —
    // re-read and return the winner instead of a raw 500.
    if (error instanceof Error && /duplicate key value violates unique constraint/i.test(error.message)) {
      const winner = await getAmbassadorByEmail(email);
      if (winner) return winner;
    }
    throw error;
  }
}

/**
 * Link an ambassador row to a user account by email. Best-effort and
 * never throws for a missing table: called on login/register, where a
 * linking failure must never block sign-in. Links only when the row
 * is still unlinked (userId null) — an already-linked row is left
 * alone, and a row linked to someone else is never stolen.
 */
export async function linkAmbassadorToUserByEmail(email: string, userId: string): Promise<Ambassador | null> {
  try {
    const ambassador = await getAmbassadorByEmail(email);
    if (!ambassador) return null;
    if (ambassador.userId) return ambassador.userId === userId ? ambassador : null;
    const updated = await getDb()
      .orm.public.Ambassador.where({ id: ambassador.id })
      .where((a) => a.userId.isNull())
      .update({ userId });
    if (!updated) return ambassador;
    return mapAmbassadorRow(updated as never);
  } catch (error) {
    if (isMissingReferralTableError(error)) return null;
    throw error;
  }
}

/**
 * Ensure an approved application has an ambassador row (with code).
 * Used on admin approve and by the backfill below. Links the user
 * account now when one exists with the same email.
 */
export async function ensureAmbassadorForApplication(
  application: { id: string; email: string },
): Promise<Ambassador> {
  const byApplication = await getAmbassadorByApplicationId(application.id);
  if (byApplication) return byApplication;
  const byEmail = await getAmbassadorByEmail(application.email);
  if (byEmail) {
    // The row exists but was granted directly (no application link) —
    // attach the application so the admin view stays consistent.
    try {
      const updated = await getDb()
        .orm.public.Ambassador.where({ id: byEmail.id })
        .update({ applicationId: application.id });
      if (updated) return mapAmbassadorRow(updated as never);
    } catch (error) {
      throwIfTableMissing(error);
    }
    return byEmail;
  }
  let userId: string | undefined;
  try {
    const user = await getUserByEmail(application.email);
    userId = user?.id;
  } catch {
    userId = undefined;
  }
  return createAmbassador({ email: application.email, applicationId: application.id, userId });
}

/**
 * Backfill: every APPROVED application gets an ambassador row + code.
 * Idempotent — already-covered applications are skipped. Called
 * (best-effort) when the admin ambassadors page loads, so
 * applications approved before this feature shipped get codes
 * without Eman running anything extra. Returns how many rows were
 * created.
 */
export async function backfillAmbassadorsForApprovedApplications(): Promise<number> {
  let created = 0;
  let page = 1;
  for (;;) {
    const list = await listAmbassadorApplications({ status: 'approved', page: String(page), limit: '100' });
    if (list.items.length === 0) break;
    for (const application of list.items) {
      const before = await getAmbassadorByApplicationId(application.id);
      if (before) continue;
      const byEmail = await getAmbassadorByEmail(application.email);
      if (byEmail) continue;
      await ensureAmbassadorForApplication(application);
      created += 1;
    }
    if (page * 100 >= list.total) break;
    page += 1;
  }
  return created;
}

// ---------------------------------------------------------------------------
// Group link + daily member count (ambassador's own record)
// ---------------------------------------------------------------------------

export interface UpdateAmbassadorGroupInput {
  groupLink?: string;
  groupMemberCount?: number;
}

/**
 * Update an ambassador's group link / member count. Setting the count
 * also stamps groupCountUpdatedAt to now (the "last updated" date
 * the dashboard shows). Returns null when the ambassador does not
 * exist. Validation (URL shape, count >= 0) lives in the API route —
 * this repository just applies the values.
 */
export async function updateAmbassadorGroup(
  ambassadorId: string,
  input: UpdateAmbassadorGroupInput,
): Promise<Ambassador | null> {
  try {
    const patch: Record<string, unknown> = {};
    if (input.groupLink !== undefined) patch.groupLink = input.groupLink;
    if (input.groupMemberCount !== undefined) {
      patch.groupMemberCount = input.groupMemberCount;
      patch.groupCountUpdatedAt = new Date();
    }
    const updated = await getDb().orm.public.Ambassador.where({ id: ambassadorId }).update(patch);
    if (!updated) return null;
    return mapAmbassadorRow(updated as never);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

/**
 * Own-record group update: resolves the ambassador from the signed-in
 * user's id first, so an ambassador can only ever edit THEIR OWN
 * record — the route passes the session user id, never a client-sent
 * ambassador id. Returns null when the user is not an ambassador.
 */
export async function updateOwnAmbassadorGroup(
  userId: string,
  input: UpdateAmbassadorGroupInput,
): Promise<Ambassador | null> {
  const ambassador = await getAmbassadorByUserId(userId);
  if (!ambassador) return null;
  return updateAmbassadorGroup(ambassador.id, input);
}

// ---------------------------------------------------------------------------
// Referral clicks
// ---------------------------------------------------------------------------

/** Record one landing on a referral link (best-effort: false when the table is missing). */
export async function recordReferralClick(ambassadorId: string, ip: string): Promise<boolean> {
  try {
    await getDb().orm.public.ReferralClick.create({
      ambassadorId,
      ip,
      day: utcDayString(),
    });
    return true;
  } catch (error) {
    if (isMissingReferralTableError(error)) return false;
    throw error;
  }
}

/** Distinct (ip, UTC day) clicks for one ambassador — the displayed click count. */
export async function countDistinctReferralClicks(ambassadorId: string): Promise<number> {
  return withReferralTableFallback(async () => {
    const rows = await getDb()
      .orm.public.ReferralClick.where({ ambassadorId })
      .select('ip', 'day')
      .all();
    const seen = new Set(rows.map((r) => `${r.ip}|${r.day}`));
    return seen.size;
  }, 0);
}

// ---------------------------------------------------------------------------
// Referral attribution (who signed up via whose link)
// ---------------------------------------------------------------------------

/**
 * Store the referrer for a newly registered user — server-side only.
 * Called from registerUser with the ambassador id resolved from the
 * `cb_ref` cookie (never a client-sent field). Best-effort: a missing
 * table or a duplicate (the user already attributed) must never fail
 * signup — returns false in both cases.
 */
export async function attributeSignupToAmbassador(ambassadorId: string, userId: string): Promise<boolean> {
  try {
    const ambassador = await getAmbassadorById(ambassadorId);
    if (!ambassador) return false;
    // One user, one ambassador: a second attribution is refused. The
    // DB unique constraint on userId is the production backstop (the
    // duplicate-key catch below); the explicit check keeps this honest
    // against the in-memory fake, which enforces no uniques.
    const existing = await getDb().orm.public.ReferralAttribution.where({ userId }).first();
    if (existing) return false;
    await getDb().orm.public.ReferralAttribution.create({ ambassadorId, userId });
    return true;
  } catch (error) {
    if (isMissingReferralTableError(error)) return false;
    if (error instanceof Error && /duplicate key value violates unique constraint/i.test(error.message)) {
      return false;
    }
    throw error;
  }
}

/**
 * Resolve a referral code for a signup. Returns the ambassador id to
 * attribute, or null when the code is invalid / unknown / inactive,
 * or when the registering email IS the ambassador's own email
 * (self-referral is impossible by construction, and this guard makes
 * it impossible even if the cookie is planted).
 */
export async function resolveReferralForSignup(code: string, email: string): Promise<string | null> {
  const ambassador = await getAmbassadorByCode(code);
  if (!ambassador) return null;
  if (ambassador.status !== 'active') return null;
  if (ambassador.email === email.trim().toLowerCase()) return null;
  return ambassador.id;
}

// ---------------------------------------------------------------------------
// 4-stage stats + team (derived from source tables)
// ---------------------------------------------------------------------------

interface ReferredUserRow {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
}

/**
 * 4-stage stats + level-1/level-2 team for several ambassadors in a
 * few batched queries. Returns a map keyed by ambassador id; unknown
 * ids (or a missing table) map to empty stats. Level 2 = referrals
 * of the ambassador's level-1 members who are themselves ambassadors
 * (their own referral code brought someone in).
 */
export async function getReferralStatsForAmbassadors(
  ambassadorIds: string[],
): Promise<
  Map<string, { stats: ReferralStats; teamLevel1: ReferralTeamMember[]; teamLevel2: ReferralTeamMember[] }>
> {
  const out = new Map<string, { stats: ReferralStats; teamLevel1: ReferralTeamMember[]; teamLevel2: ReferralTeamMember[] }>();
  for (const id of ambassadorIds) out.set(id, emptyStatsResult());
  if (ambassadorIds.length === 0) return out;

  try {
    // Clicks (distinct ip|day per ambassador).
    const clickRows = await getDb()
      .orm.public.ReferralClick.where((c) => c.ambassadorId.in(ambassadorIds))
      .select('ambassadorId', 'ip', 'day')
      .all();
    const distinctClicks = new Map<string, Set<string>>();
    for (const row of clickRows) {
      const key = row.ambassadorId as string;
      if (!distinctClicks.has(key)) distinctClicks.set(key, new Set());
      distinctClicks.get(key)!.add(`${row.ip}|${row.day}`);
    }
    for (const [id, set] of distinctClicks) out.get(id)!.stats.clicks = set.size;

    // Level-1 users per ambassador.
    const attributionRows = await getDb()
      .orm.public.ReferralAttribution.where((a) => a.ambassadorId.in(ambassadorIds))
      .all();
    const userIdsByAmbassador = new Map<string, string[]>();
    for (const row of attributionRows) {
      const key = row.ambassadorId as string;
      if (!userIdsByAmbassador.has(key)) userIdsByAmbassador.set(key, []);
      userIdsByAmbassador.get(key)!.push(row.userId as string);
    }
    const allUserIds = [...new Set(attributionRows.map((r) => r.userId as string))];
    if (allUserIds.length === 0) return out;

    const userRows = await getDb()
      .orm.public.User.where((u) => u.id.in(allUserIds))
      .where((u) => u.deletedAt.isNull())
      .select('id', 'name', 'email', 'joinedAt')
      .all();
    const userById = new Map<string, ReferredUserRow>(
      userRows.map((r) => [
        r.id as string,
        {
          id: r.id as string,
          name: r.name as string,
          email: r.email as string,
          joinedAt: r.joinedAt instanceof Date ? r.joinedAt.toISOString().slice(0, 10) : String(r.joinedAt ?? ''),
        },
      ]),
    );

    // Enrollments of the referred users (all of them, one query).
    const enrollmentRows = await getDb()
      .orm.public.Enrollment.where((e) => e.studentId.in(allUserIds))
      .where((e) => e.deletedAt.isNull())
      .select('id', 'studentId', 'paymentStatus')
      .all();
    const enrollmentsByUser = new Map<string, { id: string; paid: boolean }[]>();
    const enrollmentIds: string[] = [];
    for (const row of enrollmentRows) {
      const studentId = row.studentId as string;
      if (!enrollmentsByUser.has(studentId)) enrollmentsByUser.set(studentId, []);
      enrollmentsByUser.get(studentId)!.push({ id: row.id as string, paid: row.paymentStatus === 'paid' });
      enrollmentIds.push(row.id as string);
    }

    // Approved payments of those enrollments (the payment itself).
    const paidUserIds = new Set<string>();
    if (enrollmentIds.length > 0) {
      const approvedRows = await getDb()
        .orm.public.PaymentSubmission.where((s) => s.reviewStatus.eq('approved'))
        .where((s) => s.enrollmentId.in(enrollmentIds))
        .select('enrollmentId')
        .all();
      const enrollmentToUser = new Map(enrollmentRows.map((r) => [r.id as string, r.studentId as string]));
      for (const row of approvedRows) {
        const studentId = enrollmentToUser.get(row.enrollmentId as string);
        if (studentId) paidUserIds.add(studentId);
      }
    }

    const memberFor = (userId: string, viaName?: string): ReferralTeamMember | null => {
      const user = userById.get(userId);
      if (!user) return null;
      const enrollments = enrollmentsByUser.get(userId) ?? [];
      const paid = paidUserIds.has(userId) || enrollments.some((e) => e.paid);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        joinedAt: user.joinedAt,
        stage: paid ? 'paid' : enrollments.length > 0 ? 'enrolled' : 'signed up',
        enrollments: enrollments.length,
        viaName,
      };
    };

    // Level 1 + stage counts per ambassador.
    for (const [ambassadorId, userIds] of userIdsByAmbassador) {
      const entry = out.get(ambassadorId)!;
      const members = userIds.map((id) => memberFor(id)).filter((m): m is ReferralTeamMember => m !== null);
      entry.teamLevel1 = members;
      entry.stats.signups = members.length;
      entry.stats.enrollments = members.reduce((sum, m) => sum + m.enrollments, 0);
      entry.stats.payments = members.filter((m) => m.stage === 'paid').length;
    }

    // Level 2: level-1 members who are themselves ambassadors.
    const level1UserIds = [...userById.keys()];
    const childAmbassadors = await getDb()
      .orm.public.Ambassador.where((a) => a.userId.in(level1UserIds))
      .select('id', 'userId')
      .all();
    if (childAmbassadors.length > 0) {
      const childStats = await getReferralStatsForAmbassadors(childAmbassadors.map((c) => c.id as string));
      const childAmbassadorByUserId = new Map(childAmbassadors.map((c) => [c.userId as string, c.id as string]));
      for (const [ambassadorId, userIds] of userIdsByAmbassador) {
        const entry = out.get(ambassadorId)!;
        for (const userId of userIds) {
          const childId = childAmbassadorByUserId.get(userId);
          if (!childId) continue;
          const viaName = userById.get(userId)?.name;
          for (const member of childStats.get(childId)?.teamLevel1 ?? []) {
            entry.teamLevel2.push({ ...member, viaName });
          }
        }
      }
    }
    return out;
  } catch (error) {
    if (isMissingReferralTableError(error)) {
      for (const id of ambassadorIds) out.set(id, emptyStatsResult());
      return out;
    }
    throw error;
  }
}

/** 4-stage stats + team for one ambassador. */
export async function getAmbassadorStats(
  ambassadorId: string,
): Promise<{ stats: ReferralStats; teamLevel1: ReferralTeamMember[]; teamLevel2: ReferralTeamMember[] }> {
  const map = await getReferralStatsForAmbassadors([ambassadorId]);
  return map.get(ambassadorId) ?? emptyStatsResult();
}

/** Every ambassador with their stats + team (admin view). */
export async function listAmbassadorsWithStats(): Promise<AmbassadorWithStats[]> {
  const ambassadors = await listAmbassadors();
  if (ambassadors.length === 0) return [];
  const stats = await getReferralStatsForAmbassadors(ambassadors.map((a) => a.id));
  return ambassadors.map((a) => {
    const entry = stats.get(a.id) ?? emptyStatsResult();
    return { ...a, stats: entry.stats, teamLevel1: entry.teamLevel1, teamLevel2: entry.teamLevel2 };
  });
}

// ---------------------------------------------------------------------------
// Messages to the admin
// ---------------------------------------------------------------------------

/**
 * Send a message to the admin (from an ambassador's dashboard).
 * Message text only, 1–2000 chars (length is enforced by the API
 * route; this repository just stores it).
 */
export async function createAmbassadorMessage(ambassadorId: string, message: string): Promise<AmbassadorMessage> {
  try {
    const row = await getDb().orm.public.AmbassadorMessage.create({
      ambassadorId,
      message,
      read: false,
    });
    return mapAmbassadorMessageRow(row as never);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

/** All messages, newest first (admin). Empty when the table is missing. */
export async function listAmbassadorMessages(): Promise<AmbassadorMessage[]> {
  return withReferralTableFallback(async () => {
    const rows = await getDb().orm.public.AmbassadorMessage.orderBy((m) => m.createdAt.desc()).all();
    return rows.map((r) => mapAmbassadorMessageRow(r as never));
  }, []);
}

/** One ambassador's own sent messages, newest first (their dashboard history). */
export async function listMessagesForAmbassador(ambassadorId: string): Promise<AmbassadorMessage[]> {
  return withReferralTableFallback(async () => {
    const rows = await getDb()
      .orm.public.AmbassadorMessage.where({ ambassadorId })
      .orderBy((m) => m.createdAt.desc())
      .all();
    return rows.map((r) => mapAmbassadorMessageRow(r as never));
  }, []);
}

/** Mark a message read (admin). Returns null when the message does not exist. */
export async function markAmbassadorMessageRead(id: string): Promise<AmbassadorMessage | null> {
  try {
    const updated = await getDb().orm.public.AmbassadorMessage.where({ id }).update({ read: true });
    if (!updated) return null;
    return mapAmbassadorMessageRow(updated as never);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

/** How many unread ambassador messages the admin has (badge/count on the admin page). */
export async function countUnreadAmbassadorMessages(): Promise<number> {
  return withReferralTableFallback(async () => {
    const rows = await getDb()
      .orm.public.AmbassadorMessage.where((m) => m.read.eq(false))
      .all();
    return rows.length;
  }, 0);
}

// Re-exported for callers that need the status type only.
export type { AmbassadorStatus };
