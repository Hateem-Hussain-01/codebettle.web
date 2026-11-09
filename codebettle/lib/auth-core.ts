import { getUserByEmail, getUserById, users, type User } from './data/users';
import {
  DUMMY_HASH,
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from './security';
import { createSessionRecord, revokeAllSessionsForUser } from './session-store';
import { logAudit } from './audit';

/**
 * Authentication core — no Next.js imports, so it is unit-testable with the
 * plain Node test runner. Cookie handling lives in lib/auth.ts, which
 * re-exports everything here for existing import sites.
 *
 * Security rules:
 * - Passwords are bcrypt hashes; the old plaintext equality check is gone.
 * - Login results are generic: the caller must return the same message
 *   whether the email is unknown, the password is wrong, or the account
 *   is suspended.
 * - Registration is validated server-side and can only create students;
 *   admin/instructor elevation is an admin action (Phase 2: first-run setup).
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'instructor' | 'admin';
  avatar?: string;
}

export function toSafeUser(user: User): Omit<User, 'passwordHash'> {
  // Omit the hash via rest destructuring; `void` marks the binding as used.
  const { passwordHash: _passwordHash, ...safe } = user;
  void _passwordHash;
  return safe;
}

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
  };
}

/** Verify credentials. Returns null on any failure (unknown email, wrong password, suspended). */
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
 * Change a password. Requires the current password; revokes every session
 * (including the current one) and returns a fresh token for the caller to set.
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
  revokeAllSessionsForUser(userId);
  const { token } = createSessionRecord(userId);
  logAudit({ actorId: userId, action: 'user.change-password', entity: 'user', entityId: userId });
  return { token };
}
