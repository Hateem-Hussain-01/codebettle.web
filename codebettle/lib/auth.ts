import { cookies } from 'next/headers';
import { getUserByEmail, getUserById, users, type User } from './data/users';
import {
  DUMMY_HASH,
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from './security';
import {
  createSessionRecord,
  revokeAllSessionsForUser,
  revokeSessionToken,
  validateSessionToken,
} from './session-store';
import { logAudit } from './audit';

/**
 * Authentication — server-side sessions edition (Phase 1).
 *
 * What changed vs. the audited code:
 * - Passwords are bcrypt hashes (lib/data/users.ts `passwordHash`); the old
 *   plaintext equality check is gone.
 * - The session cookie holds ONE opaque random token. The role is read from
 *   the server-side session store + user record on every request — never
 *   from the cookie. Forging a cookie is useless without a store entry.
 * - Suspension revokes sessions, so a suspended user is logged out at once.
 * - Registration is validated server-side and can only create students;
 *   admin/instructor elevation is an admin action (Phase 2: first-run setup).
 */

export const SESSION_COOKIE = 'cb_session';
export const SESSION_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'instructor' | 'admin';
  avatar?: string;
}

export function toSafeUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
  };
}

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
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const record = validateSessionToken(token);
  if (!record) return null;

  const dbUser = getUserById(record.userId);
  if (!dbUser || dbUser.status === 'suspended') return null;
  return toSessionUser(dbUser);
}

/** Create a server-side session for a user id. Returns the raw opaque token (set it as an httpOnly cookie once). */
export function createSession(userId: string, meta?: { ip?: string; userAgent?: string }): string {
  const { token } = createSessionRecord(userId, meta);
  return token;
}

/** Revoke the current session (logout). Returns true when a session was revoked. */
export async function destroySession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return revokeSessionToken(token);
}

/**
 * Verify credentials. Generic result on purpose: the caller must return the
 * same "Invalid email or password" message whether the email is unknown,
 * the password is wrong, or the account is suspended.
 */
export async function login(email: string, password: string): Promise<SessionUser | null> {
  const user = getUserByEmail(normalizeEmail(email));
  // Keep timing uniform when the email does not exist (no enumeration oracle).
  const hash = user ? user.passwordHash : DUMMY_HASH;
  const ok = await verifyPassword(password, hash);
  if (!user || !ok) return null;
  if (user.status === 'suspended') return null;
  return toSessionUser(user);
}

export interface RegisterInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
}

/** Register a new student. Returns the safe user, or an error message. Role is forced to student. */
export async function registerUser(
  input: RegisterInput
): Promise<{ user: Omit<User, 'passwordHash'> } | { error: string }> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (!name) return { error: 'Name is required' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Valid email required' };
  const passwordError = validatePassword(input.password);
  if (passwordError) return { error: passwordError };
  if (getUserByEmail(email)) return { error: 'An account with this email already exists. Please sign in instead.' };

  const passwordHash = await hashPassword(input.password);
  const newUser: User = {
    id: `student-${Date.now()}`,
    name,
    email,
    passwordHash,
    phone: input.phone?.trim() || undefined,
    role: 'student',
    avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1C1C1C&textColor=F5C518`,
    status: 'active',
    joinedAt: new Date().toISOString().split('T')[0],
    enrolledCourses: [],
    wishlist: [],
  };
  users.push(newUser);
  logAudit({ actorId: newUser.id, action: 'user.register', entity: 'user', entityId: newUser.id });
  return { user: toSafeUser(newUser) };
}

/**
 * Change a password. Requires the current password; revokes every other
 * session and returns a fresh token for the current session.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ token: string } | { error: string }> {
  const user = getUserById(userId);
  if (!user) return { error: 'Account not found' };
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return { error: 'Current password is incorrect' };
  const passwordError = validatePassword(newPassword);
  if (passwordError) return { error: passwordError };

  user.passwordHash = await hashPassword(newPassword);
  // Revokes the current session too; the caller sets the fresh token returned here.
  revokeAllSessionsForUser(userId);
  const { token } = createSessionRecord(userId);
  logAudit({ actorId: userId, action: 'user.change-password', entity: 'user', entityId: userId });
  return { token };
}
