/**
 * Server-side session store — thin compatibility wrapper (Phase 2).
 * Records now live in the Prisma `Session` table (lib/db/sessions.ts),
 * so sessions survive restarts and work across instances. The interface
 * is unchanged: the cookie holds one opaque token, only its SHA-256 hash
 * is stored, and the role is read from the user record — never the cookie.
 */
export {
  SESSION_TTL_MS,
  activeSessionCount,
  createSessionRecord,
  revokeAllSessionsForUser,
  revokeSessionToken,
  validateSessionToken,
} from './db/sessions';
export type { CreateSessionOptions } from './db/sessions';
export type { SessionRecord } from './db/types';
