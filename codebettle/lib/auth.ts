import { cookies } from 'next/headers';
import { getUserById } from './db/users';
import { createSessionRecord, revokeSessionToken, validateSessionToken } from './db/sessions';
import { toSessionUser } from './services/auth-service';
import { hasAdminCapability, hasTeacherCapability } from './rbac';
import { VIEW_AS_COOKIE, verifyViewAsToken } from './view-as';

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
  const real = await getRealSession();
  if (!real) return null;
  // Phase 2, Module 21.4 — admin-assisted view-as overlay. When the
  // signed-in admin holds a valid view-as token, the effective session
  // is the TEACHER (so the teacher portal renders the teacher's own
  // data), marked with `viewAs` so write routes refuse mutations and
  // layouts show the viewing banner. The real (admin) session is
  // untouched — getRealSession() below still returns it — and a
  // forged/expired/mismatched token simply yields the admin session.
  // View-as never opens a student portal: the token is only minted
  // for teachers (see the view-as route/service) and is re-checked
  // here against the teacher flag on every request.
  const cookieStore = await cookies();
  const token = cookieStore.get(VIEW_AS_COOKIE)?.value;
  const payload = verifyViewAsToken(token);
  if (!payload || payload.adminId !== real.id) return real;
  if (!hasAdminCapability(real)) return real;
  if (payload.teacherId === real.id) return real;
  const teacher = await getUserById(payload.teacherId);
  if (!teacher || teacher.status !== 'active') return real;
  if (!hasTeacherCapability(teacher)) return real;
  return {
    ...toSessionUser(teacher),
    viewAs: { adminId: real.id, adminName: real.name },
  };
}

/**
 * The real session, without the view-as overlay: the user who actually
 * signed in. Use this where the acting admin matters — the view-as
 * exit route (which must clear the cookie as the admin), and anywhere
 * a view-as session must not be mistaken for the admin.
 */
export async function getRealSession() {
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
