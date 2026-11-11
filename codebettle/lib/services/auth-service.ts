/**
 * Authentication service (Phase 2, Prisma-backed).
 *
 * Same behaviour as the Phase 1 lib/auth-core.ts, now reading/writing
 * Postgres through the repositories. No Next.js imports — unit-testable
 * with the fake db. Cookie handling lives in lib/auth.ts.
 *
 * Security rules (unchanged from Phase 1):
 * - Passwords are bcrypt hashes; the old plaintext equality check is gone.
 * - Login results are generic: the caller must return the same message
 *   whether the email is unknown, the password is wrong, or the account
 *   is suspended.
 * - Registration is validated server-side and can only create students;
 *   admin accounts come only from the first-run setup flow.
 */
import { DUMMY_HASH, hashPassword, normalizeEmail, validatePassword, verifyPassword } from '../security';
import { createUser, getUserByEmail, getUserByIdWithHash, updateUserPassword } from '../db/users';
import { createSessionRecord, revokeAllSessionsForUser } from '../db/sessions';
import { logAudit } from '../db/audit';
import { toSafeUser } from '../db/mappers';
import type { AdminPermissions, SafeUser, User } from '../db/types';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'instructor' | 'admin';
  avatar?: string;
  /**
   * Phase 2 flags, read fresh from the user record on every request
   * (see getSession in lib/auth.ts) — a flag change takes effect on the
   * next request, same as a role change. Guards read these, never
   * `role` alone (see lib/rbac.ts hasAdminCapability /
   * hasTeacherCapability). Optional so hand-built test sessions that
   * only carry a role keep compiling; an absent flag is treated as
   * false and the capability helpers fall back to `role`.
   * toSessionUser always populates both.
   */
  isAdmin?: boolean;
  isTeacher?: boolean;
  /**
   * Per-area admin permissions (Item G), read fresh from the user record
   * on every request (see getSession in lib/auth.ts). Undefined = full
   * admin (every area granted). A map grants only the listed areas.
   * Guards read this directly — no extra query is needed.
   */
  adminPermissions?: AdminPermissions;
}

export function toSessionUser(user: User | SafeUser): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    // `?? false` covers User objects built before the flags existed
    // (e.g. hand-built fixtures in tests).
    isAdmin: user.isAdmin ?? false,
    isTeacher: user.isTeacher ?? false,
    adminPermissions: user.adminPermissions,
  };
}

/** Verify credentials. Returns null on any failure (unknown email, wrong password, suspended). */
export async function login(email: string, password: string): Promise<SessionUser | null> {
  const user = await getUserByEmail(normalizeEmail(email));
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
  input: RegisterInput,
): Promise<{ user: SafeUser } | { error: string }> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (!name) return { error: 'Name is required' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Valid email required' };
  const passwordError = validatePassword(input.password);
  if (passwordError) return { error: passwordError };
  if (await getUserByEmail(email)) {
    return { error: 'An account with this email already exists. Please sign in instead.' };
  }

  const passwordHash = await hashPassword(input.password);
  const user = await createUser({
    name,
    email,
    passwordHash,
    phone: input.phone?.trim() || undefined,
    role: 'student',
    avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1C1C1C&textColor=F5C518`,
  });
  await logAudit({ actorId: user.id, action: 'user.register', entity: 'user', entityId: user.id });
  return { user };
}

/**
 * Change a password. Requires the current password; revokes every session
 * (including the current one) and returns a fresh token for the caller to set.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ token: string } | { error: string }> {
  const user = await getUserByIdWithHash(userId);
  if (!user) return { error: 'Account not found' };
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return { error: 'Current password is incorrect' };
  const passwordError = validatePassword(newPassword);
  if (passwordError) return { error: passwordError };

  await updateUserPassword(userId, await hashPassword(newPassword));
  await revokeAllSessionsForUser(userId);
  const { token } = await createSessionRecord(userId);
  await logAudit({ actorId: userId, action: 'user.change-password', entity: 'user', entityId: userId });
  return { token };
}

export { toSafeUser };
