import { generateSessionToken, hashToken } from './security';

/**
 * Server-side session store.
 *
 * Phase 1: an in-memory Map. Sessions are validated against this store on
 * every request, so a stolen or forged cookie is useless and suspending a
 * user (or revoking sessions) logs them out immediately. The store is lost
 * on server restart — users simply sign in again.
 *
 * Phase 2: this module's interface stays the same, but records move to the
 * Prisma `sessions` table (see prisma/schema.prisma) so sessions survive
 * restarts and work across instances.
 *
 * Why globalThis: Next.js bundles each route separately, so a plain
 * module-level Map is NOT shared between API routes (which create sessions)
 * and pages/layouts (which validate them) — a session created by /api/auth
 * was invisible to /student/dashboard, which redirected to login. Backing
 * the store with globalThis makes it a true single-process singleton
 * (the standard Next.js singleton pattern). It is still lost on restart
 * and still does not span server instances — Phase 2 fixes that properly.
 */

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches the old cookie lifetime

// NOTE on "sliding renewal": the plan asks for it, but with a 7-day absolute
// cap equal to the 7-day idle window, extending expiry on activity is a
// no-op (expiry is already creation + 7 days). True sliding sessions need
// an idle window shorter than the absolute cap AND re-issuing the browser
// cookie on activity — a Phase 2 decision, not smuggled in here. Until
// then, sessions live exactly 7 days from creation and validation only
// refreshes lastSeenAt (activity tracking).

export interface SessionRecord {
  /** SHA-256 hash of the opaque token. The raw token is never stored. */
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  revokedAt: number | null;
  ip?: string;
  userAgent?: string;
}

const globalForSessions = globalThis as unknown as {
  __cbSessionStore?: Map<string, SessionRecord>;
};
const store = (globalForSessions.__cbSessionStore ??= new Map<string, SessionRecord>());

export interface CreateSessionOptions {
  now?: number;
  ttlMs?: number;
  ip?: string;
  userAgent?: string;
}

/** Create a session and return the raw opaque token (give it to the client once, in an httpOnly cookie). */
export function createSessionRecord(
  userId: string,
  opts: CreateSessionOptions = {}
): { token: string; record: SessionRecord } {
  const now = opts.now ?? Date.now();
  const token = generateSessionToken();
  const record: SessionRecord = {
    id: hashToken(token),
    userId,
    createdAt: now,
    expiresAt: now + (opts.ttlMs ?? SESSION_TTL_MS),
    lastSeenAt: now,
    revokedAt: null,
    ip: opts.ip,
    userAgent: opts.userAgent,
  };
  store.set(record.id, record);
  return { token, record };
}

/**
 * Validate a raw token. Returns the session record, or null when the token
 * is unknown, revoked, or expired. Refreshes lastSeenAt; expiry is never
 * extended beyond creation + SESSION_TTL_MS (see the note above).
 */
export function validateSessionToken(token: string, now: number = Date.now()): SessionRecord | null {
  const record = store.get(hashToken(token));
  if (!record) return null;
  if (record.revokedAt !== null) return null;
  if (record.expiresAt <= now) {
    store.delete(record.id);
    return null;
  }
  record.lastSeenAt = now;
  return record;
}

/** Revoke one session (logout). Returns true when a session was revoked. */
export function revokeSessionToken(token: string): boolean {
  const record = store.get(hashToken(token));
  if (!record || record.revokedAt !== null) return false;
  record.revokedAt = Date.now();
  return true;
}

/** Revoke every session belonging to a user (suspension, password reset, "revoke all"). */
export function revokeAllSessionsForUser(userId: string): number {
  let count = 0;
  const now = Date.now();
  for (const record of store.values()) {
    if (record.userId === userId && record.revokedAt === null) {
      record.revokedAt = now;
      count += 1;
    }
  }
  return count;
}

/** Active (non-revoked, non-expired) session count — for monitoring and tests. */
export function activeSessionCount(now: number = Date.now()): number {
  let count = 0;
  for (const record of store.values()) {
    if (record.revokedAt === null && record.expiresAt > now) count += 1;
  }
  return count;
}

/** Test helper: clear the store. Never call in production code. */
export function __clearSessionStore(): void {
  store.clear();
}
