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
import { createUser, getUserByEmail, getUserById, setUserStatusDb, softDeleteUser, updateUser } from '../db/users';
import { revokeAllSessionsForUser } from '../db/sessions';
import { logAudit } from '../db/audit';
import type { SafeUser, SocialLinks, UserRole } from '../db/types';
import { badRequest, forbidden, notFound, type ServiceError } from './errors';
import { hasAdminCapability } from '../rbac';

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
    // Phase 2: keep the teacher flag in sync with the primary role.
    isTeacher: role === 'instructor',
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

export interface UpdateManagedUserInput {
  name?: string;
  email?: string;
  phone?: string | null;
  avatar?: string | null;
  bio?: string | null;
  expertise?: string[];
  socialLinks?: SocialLinks | null;
  role?: ManagedRole;
}

/**
 * Edit a managed user's details (Phase 3, PUT /api/admin/users/[id]).
 * Role changes are the only restricted part: student <-> instructor only —
 * never to admin, never for an admin account, never your own role. Email
 * must stay unique across accounts. Passwords are never changed here.
 */
export async function updateManagedUser(
  actorId: string,
  userId: string,
  input: UpdateManagedUserInput,
): Promise<{ user: SafeUser } | ServiceError> {
  const target = await getUserById(userId);
  if (!target) return notFound('User');
  if (input.role !== undefined) {
    // Phase 2: an admin-capability account (flag or legacy role) can never have its role changed here.
    if (hasAdminCapability(target)) return forbidden('Cannot change the role of an admin account');
    if (userId === actorId) return forbidden('You cannot change your own role');
    if (input.role !== 'student' && input.role !== 'instructor') {
      return badRequest('Role must be student or instructor');
    }
  }
  let email = target.email;
  if (input.email !== undefined) {
    email = normalizeEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest('Valid email required');
    const existing = await getUserByEmail(email);
    if (existing && existing.id !== userId) {
      return badRequest('An account with this email already exists');
    }
  }
  if (input.name !== undefined && !input.name.trim()) return badRequest('Name is required');
  const updated = await updateUser(userId, {
    name: input.name?.trim(),
    email: input.email !== undefined ? email : undefined,
    phone: input.phone,
    avatar: input.avatar,
    bio: input.bio,
    expertise: input.expertise,
    socialLinks: input.socialLinks,
    role: input.role,
    // Phase 2: keep the teacher flag in sync with the new primary role.
    isTeacher: input.role === 'instructor' ? true : input.role === 'student' ? false : undefined,
  });
  if (!updated) return notFound('User');
  await logAudit({
    actorId,
    action: 'admin.user.update',
    entity: 'user',
    entityId: userId,
    detail: `${updated.role} ${updated.email}`,
  });
  return { user: updated };
}

export type { UserRole };
