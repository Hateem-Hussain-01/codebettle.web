/**
 * Admin access management service (Item G).
 *
 * The logic behind /api/admin/access. No Next.js imports — unit-testable
 * with the fake db.
 *
 * Phase 5 (Module 23) — SUPER-ADMIN gating: only a SUPER-ADMIN (one of
 * the two official administrators, see lib/super-admin.ts) may call
 * these functions; a non-official full admin can no longer grant,
 * revoke, or list admin access. The routes enforce that too, and the
 * service re-checks the actor from the database so the rule holds even
 * if a route forgets the gate. Defense-in-depth: an official target
 * may only be modified by a super-admin actor, checked again inside
 * grant/revoke even though the actor gate already requires it.
 *
 * Phase 2 — flags role model: admin access is the `isAdmin` FLAG, not
 * the primary `role`. Granting admin sets isAdmin=true and PRESERVES
 * the user's existing primary role and flags (a teacher stays a
 * teacher; their primary role is NOT overwritten to 'admin' — the
 * flag alone confers admin capability, and the primary role stays
 * their home portal). Revoking admin clears isAdmin (and
 * adminPermissions) and restores the primary `role` from the remaining
 * flags: isTeacher -> 'instructor', otherwise 'student'. The old code
 * set role back to 'student' unconditionally, destroying a teacher's
 * role — that bug is fixed here; a revoked teacher keeps teaching.
 *
 * Safety rules:
 * - You cannot change your own admin access (no self-lockout, no
 *   self-escalation through this path). This ban is also what guarantees
 *   a super-admin always remains: the only way to lose admin status
 *   is through these functions, and they can only demote OTHER admins,
 *   so the acting super-admin always survives.
 * - Revoking admin access revokes all of the user's sessions at once,
 *   so they are logged out of the admin portal immediately.
 * - Granting requires at least one area checked. Checking every area
 *   grants FULL admin (permissions stored as NULL).
 * - Every change is audit-logged.
 */
import { getAllUsers, getUserById, updateUser } from '../db/users';
import { revokeAllSessionsForUser } from '../db/sessions';
import { logAudit } from '../db/audit';
import { hasAdminCapability, hasTeacherCapability, type CapabilitySubject } from '../rbac';
import { isSuperAdmin, isSuperAdminEmail } from '../super-admin';
import {
  ADMIN_AREA_KEYS,
  normaliseAdminPermissions,
  type AdminPermissions,
} from '../admin-access';
import { badRequest, forbidden, notFound, type ServiceError } from './errors';
import type { SafeUser } from '../db/types';

async function getSuperAdminActor(actorId: string): Promise<SafeUser | ServiceError> {
  const actor = await getUserById(actorId);
  if (!actor) return notFound('Admin user');
  if (!isSuperAdmin(actor)) {
    return forbidden('Super admin access required');
  }
  return actor;
}

/**
 * Phase 2: the primary role a user falls back to when admin access is
 * revoked — derived from the remaining flags, never guessed. A teacher
 * keeps teaching; everyone else returns to the student portal.
 */
export function primaryRoleAfterRevoke(user: CapabilitySubject): 'instructor' | 'student' {
  return hasTeacherCapability(user) ? 'instructor' : 'student';
}

/** All users (safe fields) for the /admin/access picker. Super-admins only. */
export async function listAccessUsers(
  actorId: string,
): Promise<{ users: SafeUser[] } | ServiceError> {
  const actor = await getSuperAdminActor(actorId);
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
 * - Phase 2: granting sets isAdmin=true and PRESERVES the target's
 *   primary role and flags — a teacher granted admin stays a teacher
 *   (isTeacher untouched, role untouched). The flag alone confers
 *   admin capability; overwriting role to 'admin' would destroy the
 *   record of what the user was before.
 */
export async function updateAdminAccess(
  actorId: string,
  userId: string,
  input: UpdateAdminAccessInput,
): Promise<{ user: SafeUser } | ServiceError> {
  const actor = await getSuperAdminActor(actorId);
  if ('error' in actor) return actor;
  if (userId === actorId) {
    return forbidden('You cannot change your own admin access');
  }
  const target = await getUserById(userId);
  if (!target) return notFound('User');
  // Defense-in-depth: an official target may only be modified by a
  // super-admin actor, even if a future caller skips the actor gate.
  if (isSuperAdminEmail(target.email) && !isSuperAdmin(actor)) {
    return forbidden('Only a super admin can change an official administrator');
  }
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

  const wasAdmin = hasAdminCapability(target);
  const updated = await updateUser(userId, {
    isAdmin: true,
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
 * Revoke admin access: clear isAdmin + permissions, restore the
 * primary role from the remaining flags (teacher -> 'instructor',
 * otherwise 'student'), revoke all sessions. Refused for yourself
 * (see the header note — that ban is what guarantees a full admin
 * always remains). A teacher who loses admin keeps their teacher
 * capability and their account/data — nothing is deleted.
 */
export async function revokeAdminAccess(
  actorId: string,
  userId: string,
): Promise<{ user: SafeUser } | ServiceError> {
  const actor = await getSuperAdminActor(actorId);
  if ('error' in actor) return actor;
  if (userId === actorId) {
    return forbidden('You cannot revoke your own admin access');
  }
  const target = await getUserById(userId);
  if (!target) return notFound('User');
  // Defense-in-depth: an official target may only be modified by a
  // super-admin actor, even if a future caller skips the actor gate.
  if (isSuperAdminEmail(target.email) && !isSuperAdmin(actor)) {
    return forbidden('Only a super admin can change an official administrator');
  }
  if (!hasAdminCapability(target)) {
    return badRequest('This user does not have admin access');
  }

  const updated = await updateUser(userId, {
    isAdmin: false,
    role: primaryRoleAfterRevoke(target),
    adminPermissions: null,
  });
  if (!updated) return notFound('User');
  await revokeAllSessionsForUser(userId);
  await logAudit({
    actorId,
    action: 'admin.access.revoke',
    entity: 'user',
    entityId: userId,
    detail: `${target.email} admin access revoked${hasTeacherCapability(target) ? ' (teacher role kept)' : ''}`,
  });
  return { user: updated };
}

export type { AdminPermissions };
