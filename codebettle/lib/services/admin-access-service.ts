/**
 * Admin access management service (Item G).
 *
 * The logic behind /api/admin/access. No Next.js imports — unit-testable
 * with the fake db. Only a FULL admin (role `admin` with no permissions
 * restriction) may call these functions; the routes enforce that too, and
 * the service re-checks the actor from the database so the rule holds
 * even if a route forgets the gate.
 *
 * Safety rules:
 * - You cannot change your own admin access (no self-lockout, no
 *   self-escalation through this path). This ban is also what guarantees
 *   a full admin always remains: the only way to lose full-admin status
 *   is through these functions, and they can only demote OTHER admins,
 *   so the acting full admin always survives.
 * - Revoking admin access returns the account to the student role and
 *   revokes all of its sessions at once, so it is logged out of the
 *   admin portal immediately.
 * - Granting requires at least one area checked. Checking every area
 *   grants FULL admin (permissions stored as NULL).
 * - Every change is audit-logged.
 */
import { getAllUsers, getUserById, updateUser } from '../db/users';
import { revokeAllSessionsForUser } from '../db/sessions';
import { logAudit } from '../db/audit';
import {
  ADMIN_AREA_KEYS,
  isFullAdmin,
  normaliseAdminPermissions,
  type AdminPermissions,
} from '../admin-access';
import { badRequest, forbidden, notFound, type ServiceError } from './errors';
import type { SafeUser } from '../db/types';

async function getFullAdminActor(actorId: string): Promise<SafeUser | ServiceError> {
  const actor = await getUserById(actorId);
  if (!actor) return notFound('Admin user');
  if (actor.role !== 'admin' || !isFullAdmin(actor.adminPermissions)) {
    return forbidden('Full admin access required');
  }
  return actor;
}

/** All users (safe fields) for the /admin/access picker. Full admins only. */
export async function listAccessUsers(
  actorId: string,
): Promise<{ users: SafeUser[] } | ServiceError> {
  const actor = await getFullAdminActor(actorId);
  if ('error' in actor) return actor;
  return { users: await getAllUsers() };
}

export interface UpdateAdminAccessInput {
  /** Per-area grants from the checkbox form (area key -> granted). */
  permissions: Record<string, unknown>;
}

/**
 * Grant admin access to a user, or update a restricted admin's areas.
 * - Target must exist and be active (a suspended account cannot be
 *   given admin access).
 * - At least one area must be granted. All areas granted = full admin.
 */
export async function updateAdminAccess(
  actorId: string,
  userId: string,
  input: UpdateAdminAccessInput,
): Promise<{ user: SafeUser } | ServiceError> {
  const actor = await getFullAdminActor(actorId);
  if ('error' in actor) return actor;
  if (userId === actorId) {
    return forbidden('You cannot change your own admin access');
  }
  const target = await getUserById(userId);
  if (!target) return notFound('User');
  if (target.status !== 'active') {
    return badRequest('Only an active account can be given admin access');
  }

  const permissions = normaliseAdminPermissions(input.permissions);
  const grantedCount =
    permissions === undefined
      ? ADMIN_AREA_KEYS.length
      : ADMIN_AREA_KEYS.filter((key) => permissions[key] === true).length;
  if (grantedCount === 0) {
    return badRequest('Select at least one admin area to grant');
  }

  const wasAdmin = target.role === 'admin';
  const updated = await updateUser(userId, {
    role: 'admin',
    // Full admin stores NULL (no restriction); restricted stores the map.
    adminPermissions: permissions === undefined ? null : permissions,
  });
  if (!updated) return notFound('User');
  await logAudit({
    actorId,
    action: wasAdmin ? 'admin.access.update' : 'admin.access.grant',
    entity: 'user',
    entityId: userId,
    detail:
      permissions === undefined
        ? `${target.email} granted full admin access`
        : `${target.email} granted admin access to: ${ADMIN_AREA_KEYS.filter((k) => permissions[k]).join(', ')}`,
  });
  return { user: updated };
}

/**
 * Revoke admin access: role back to student, permissions cleared, all
 * sessions revoked. Refused for yourself (see the header note — that ban
 * is what guarantees a full admin always remains).
 */
export async function revokeAdminAccess(
  actorId: string,
  userId: string,
): Promise<{ user: SafeUser } | ServiceError> {
  const actor = await getFullAdminActor(actorId);
  if ('error' in actor) return actor;
  if (userId === actorId) {
    return forbidden('You cannot revoke your own admin access');
  }
  const target = await getUserById(userId);
  if (!target) return notFound('User');
  if (target.role !== 'admin') {
    return badRequest('This user does not have admin access');
  }

  const updated = await updateUser(userId, { role: 'student', adminPermissions: null });
  if (!updated) return notFound('User');
  await revokeAllSessionsForUser(userId);
  await logAudit({
    actorId,
    action: 'admin.access.revoke',
    entity: 'user',
    entityId: userId,
    detail: `${target.email} admin access revoked`,
  });
  return { user: updated };
}

export type { AdminPermissions };
