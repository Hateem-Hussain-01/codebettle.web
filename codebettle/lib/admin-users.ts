import { getUserByEmail, getUserById, users, type User } from './data/users';
import { hashPassword, normalizeEmail, validatePassword } from './security';
import { revokeAllSessionsForUser } from './session-store';
import { logAudit } from './audit';
import { toSafeUser } from './auth-core';

/**
 * Admin user management — the logic behind /api/admin/users.
 * No Next.js imports: the route handlers only enforce the admin gate
 * (getSession + role check) and then call these functions, so the logic
 * is unit-testable. Passwords are hashed server-side; the caller can
 * never create an admin through these functions.
 */

export type ManagedRole = 'student' | 'instructor';
export type SafeUser = Omit<User, 'passwordHash'>;

export interface CreateManagedUserInput {
  name: string;
  email: string;
  password: string;
  role?: ManagedRole;
}

export async function createManagedUser(
  actorId: string,
  input: CreateManagedUserInput
): Promise<{ user: SafeUser } | { error: string }> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const role: ManagedRole = input.role ?? 'student';
  if (!name) return { error: 'Name is required' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Valid email required' };
  const passwordError = validatePassword(input.password);
  if (passwordError) return { error: passwordError };
  if (getUserByEmail(email)) return { error: 'An account with this email already exists' };

  const newUser: User = {
    id: `${role}-${Date.now()}`,
    name,
    email,
    passwordHash: await hashPassword(input.password),
    role,
    avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1C1C1C&textColor=F5C518`,
    status: 'active',
    joinedAt: new Date().toISOString().split('T')[0],
    enrolledCourses: [],
    wishlist: [],
  };
  users.push(newUser);
  logAudit({
    actorId,
    action: 'admin.user.create',
    entity: 'user',
    entityId: newUser.id,
    detail: `${role} ${email}`,
  });
  return { user: toSafeUser(newUser) };
}

/** Suspend or activate a user. Suspending revokes every session at once. */
export function setUserStatus(
  actorId: string,
  userId: string,
  status: 'active' | 'suspended'
): { status: 'active' | 'suspended' } | { error: string } {
  const user = getUserById(userId);
  if (!user) return { error: 'User not found' };
  if (user.id === actorId) return { error: 'You cannot suspend your own account' };
  user.status = status;
  if (status === 'suspended') {
    revokeAllSessionsForUser(user.id);
  }
  logAudit({
    actorId,
    action: `admin.user.${status === 'suspended' ? 'suspend' : 'activate'}`,
    entity: 'user',
    entityId: user.id,
  });
  return { status: user.status };
}

/** Remove a user and revoke all of their sessions. Phase 2 replaces this with a soft delete. */
export function deleteManagedUser(
  actorId: string,
  userId: string
): { success: true } | { error: string } {
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return { error: 'User not found' };
  if (users[index].id === actorId) return { error: 'You cannot delete your own account' };
  const [removed] = users.splice(index, 1);
  revokeAllSessionsForUser(removed.id);
  logAudit({
    actorId,
    action: 'admin.user.delete',
    entity: 'user',
    entityId: removed.id,
    detail: removed.email,
  });
  return { success: true };
}
