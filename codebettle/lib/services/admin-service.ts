/**
 * Admin user management service (Phase 2, Prisma-backed).
 *
 * Same behaviour as the Phase 1 lib/admin-users.ts, now against Postgres.
 * The logic behind /api/admin/users. No Next.js imports — unit-testable
 * with the fake db. Passwords are hashed server-side; the caller can
 * never create an admin through these functions (admins come only from
 * the first-run setup flow).
 *
 * Phase 2 change: delete is now a SOFT delete (deletedAt set, sessions
 * revoked) — the user row stays for audit and enrolment history.
 */
import { hashPassword, normalizeEmail, validatePassword } from '../security';
import { createUser, getUserByEmail, getUserById, setUserStatusDb, softDeleteUser } from '../db/users';
import { revokeAllSessionsForUser } from '../db/sessions';
import { logAudit } from '../db/audit';
import type { SafeUser, UserRole } from '../db/types';

export type ManagedRole = 'student' | 'instructor';
export type { SafeUser } from '../db/types';

export interface CreateManagedUserInput {
  name: string;
  email: string;
  password: string;
  role?: ManagedRole;
}

export async function createManagedUser(
  actorId: string,
  input: CreateManagedUserInput,
): Promise<{ user: SafeUser } | { error: string }> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const role: ManagedRole = input.role ?? 'student';
  if (!name) return { error: 'Name is required' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Valid email required' };
  const passwordError = validatePassword(input.password);
  if (passwordError) return { error: passwordError };
  if (await getUserByEmail(email)) return { error: 'An account with this email already exists' };

  const user = await createUser({
    name,
    email,
    passwordHash: await hashPassword(input.password),
    role,
    avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1C1C1C&textColor=F5C518`,
  });
  await logAudit({
    actorId,
    action: 'admin.user.create',
    entity: 'user',
    entityId: user.id,
    detail: `${role} ${email}`,
  });
  return { user };
}

/** Suspend or activate a user. Suspending revokes every session at once. */
export async function setUserStatus(
  actorId: string,
  userId: string,
  status: 'active' | 'suspended',
): Promise<{ status: 'active' | 'suspended' } | { error: string }> {
  const user = await getUserById(userId);
  if (!user) return { error: 'User not found' };
  if (user.id === actorId) return { error: 'You cannot suspend your own account' };
  const updated = await setUserStatusDb(userId, status);
  if (!updated) return { error: 'User not found' };
  if (status === 'suspended') {
    await revokeAllSessionsForUser(user.id);
  }
  await logAudit({
    actorId,
    action: `admin.user.${status === 'suspended' ? 'suspend' : 'activate'}`,
    entity: 'user',
    entityId: user.id,
  });
  return { status: updated.status };
}

/**
 * Soft-delete a user and revoke all of their sessions. The row stays in
 * the database (deletedAt set) so enrolments, certificates and audit
 * history keep their references.
 */
export async function deleteManagedUser(
  actorId: string,
  userId: string,
): Promise<{ success: true } | { error: string }> {
  const user = await getUserById(userId);
  if (!user) return { error: 'User not found' };
  if (user.id === actorId) return { error: 'You cannot delete your own account' };
  const removed = await softDeleteUser(userId);
  if (!removed) return { error: 'User not found' };
  await revokeAllSessionsForUser(userId);
  await logAudit({
    actorId,
    action: 'admin.user.delete',
    entity: 'user',
    entityId: userId,
    detail: user.email,
  });
  return { success: true };
}

export type { UserRole };
