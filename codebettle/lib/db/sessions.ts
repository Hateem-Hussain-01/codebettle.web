/**
 * Server-side session store (Phase 2, Prisma-backed).
 *
 * Same function names and semantics as the Phase 1 in-memory store, now
 * persisted in the Prisma `Session` table so sessions survive restarts
 * and work across instances:
 * - The cookie holds ONE opaque random token; only its SHA-256 hash is
 *   stored (id column). A forged or stolen cookie is useless without a
 *   matching, unrevoked, unexpired row.
 * - Role is read from the user record, never from the cookie.
 * - Suspension revokes sessions, so a suspended user is logged out at once.
 * - Sessions live exactly 7 days from creation. Validation refreshes
 *   lastSeenAt (activity tracking) but never extends expiry.
 */
import { generateSessionToken, hashToken } from '../security';
import { getDb } from './client';
import type { SessionRecord } from './types';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches the old cookie lifetime

export interface CreateSessionOptions {
  now?: number;
  ttlMs?: number;
  ip?: string;
  userAgent?: string;
}

function toRecord(row: {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  ip: string | null;
  userAgent: string | null;
}): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
    lastSeenAt: row.lastSeenAt.getTime(),
    revokedAt: row.revokedAt ? row.revokedAt.getTime() : null,
    ip: row.ip ?? undefined,
    userAgent: row.userAgent ?? undefined,
  };
}

/** Create a session and return the raw opaque token (give it to the client once, in an httpOnly cookie). */
export async function createSessionRecord(
  userId: string,
  opts: CreateSessionOptions = {},
): Promise<{ token: string; record: SessionRecord }> {
  const now = opts.now ?? Date.now();
  const token = generateSessionToken();
  const row = await getDb().orm.public.Session.create({
    id: hashToken(token),
    userId,
    createdAt: new Date(now),
    expiresAt: new Date(now + (opts.ttlMs ?? SESSION_TTL_MS)),
    lastSeenAt: new Date(now),
    ip: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
  });
  return { token, record: toRecord(row) };
}

/**
 * Validate a raw token. Returns the session record, or null when the token
 * is unknown, revoked, or expired. Refreshes lastSeenAt; expiry is never
 * extended beyond creation + SESSION_TTL_MS. Expired rows are deleted.
 */
export async function validateSessionToken(
  token: string,
  now: number = Date.now(),
): Promise<SessionRecord | null> {
  const id = hashToken(token);
  const row = await getDb().orm.public.Session.where({ id }).first();
  if (!row) return null;
  if (row.revokedAt !== null) return null;
  if (row.expiresAt.getTime() <= now) {
    await getDb().orm.public.Session.where({ id }).delete();
    return null;
  }
  const updated = await getDb()
    .orm.public.Session.where({ id })
    .update({ lastSeenAt: new Date(now) });
  return updated ? toRecord(updated) : null;
}

/** Revoke one session (logout). Returns true when a session was revoked. */
export async function revokeSessionToken(token: string): Promise<boolean> {
  const id = hashToken(token);
  const row = await getDb()
    .orm.public.Session.where({ id })
    .where((s) => s.revokedAt.isNull())
    .update({ revokedAt: new Date() });
  return row !== null;
}

/** Revoke every session belonging to a user (suspension, password reset, "revoke all"). */
export async function revokeAllSessionsForUser(userId: string): Promise<number> {
  const active = await getDb()
    .orm.public.Session.where({ userId })
    .where((s) => s.revokedAt.isNull())
    .select('id')
    .all();
  if (active.length === 0) return 0;
  await getDb()
    .orm.public.Session.where({ userId })
    .where((s) => s.revokedAt.isNull())
    .updateAll({ revokedAt: new Date() });
  return active.length;
}

/** Active (non-revoked, non-expired) session count — for monitoring and tests. */
export async function activeSessionCount(now: number = Date.now()): Promise<number> {
  const rows = await getDb()
    .orm.public.Session.where((s) => s.revokedAt.isNull())
    .select('id', 'expiresAt')
    .all();
  return rows.filter((r) => r.expiresAt.getTime() > now).length;
}
