import { cookies } from 'next/headers';
import { getUserById } from './db/users';
import { createSessionRecord, revokeSessionToken, validateSessionToken } from './db/sessions';
import { toSessionUser } from './services/auth-service';

// Re-export the testable core for existing import sites (routes, pages).
export { changePassword, login, registerUser, toSafeUser } from './services/auth-service';
export type { RegisterInput, SessionUser } from './services/auth-service';

/**
 * Authentication — cookie/session layer (Phase 2, Prisma-backed sessions).
 *
 * The session cookie holds ONE opaque random token. The role is read from
 * the server-side session record + user record on every request — never
 * from the cookie. Forging a cookie is useless without a store entry.
 * Suspension revokes sessions, so a suspended user is logged out at once.
 * Pure logic (login, register, change password) lives in
 * lib/services/auth-service.ts.
 */

export const SESSION_COOKIE = 'cb_session';
export const SESSION_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 7; // 7 days

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_COOKIE_MAX_AGE_S,
    path: '/',
  };
}

/** Validate the session cookie against the server-side store. Role comes from the user record, never the cookie. */
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const record = await validateSessionToken(token);
  if (!record) return null;

  const dbUser = await getUserById(record.userId);
  if (!dbUser || dbUser.status === 'suspended') return null;
  return toSessionUser(dbUser);
}

/** Create a server-side session for a user id. Returns the raw opaque token (set it as an httpOnly cookie once). */
export async function createSession(userId: string, meta?: { ip?: string; userAgent?: string }): Promise<string> {
  const { token } = await createSessionRecord(userId, meta);
  return token;
}

/** Revoke the current session (logout). Returns true when a session was revoked. */
export async function destroySession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return revokeSessionToken(token);
}
