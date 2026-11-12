/**
 * Audit-log access management service (Phase 5, Module 23 — Super Admin
 * & Audit).
 *
 * The logic behind the audit-access admin API. No Next.js imports —
 * unit-testable with the fake db.
 *
 * Who may view the audit log:
 * - The two official administrators (super-admins, lib/super-admin.ts)
 *   always have access, with or without the flag.
 * - Any other ADMIN may be granted access explicitly via the
 *   `canViewAuditLog` flag on their User record.
 *
 * Rules (all enforced here from the database, so they hold even if a
 * route forgets its gate):
 * - Only a SUPER-ADMIN may grant, revoke, or list audit access. The
 *   actor is re-read from the database on every call — never trust
 *   the session alone.
 * - The target must exist, be active, and hold admin capability
 *   (isAdmin flag or legacy role 'admin'). A plain student/teacher
 *   cannot be given audit access.
 * - Granting an official is a no-op success (they always have access);
 *   revoking an official is FORBIDDEN (officials are non-revocable).
 * - Granting sets canViewAuditLog=true, revoking sets it false.
 *   Granting an already-granted user is a no-op success (idempotent);
 *   revoking a user who holds the flag clears it even if they have
 *   since lost admin capability (so a stale flag can never get stuck).
 * - Every grant/revoke writes an AuditLog entry.
 */
import { getAllUsers, getUserById, updateUser } from '../db/users';
import { logAudit } from '../db/audit';
import { hasAdminCapability } from '../rbac';
import { isSuperAdmin, isSuperAdminEmail } from '../super-admin';
import { badRequest, forbidden, notFound, type ServiceError } from './errors';
import type { SafeUser } from '../db/types';

/** The actor must be a super-admin (re-read from the DB, never the session alone). */
async function getSuperAdminActor(actorId: string): Promise<SafeUser | ServiceError> {
  const actor = await getUserById(actorId);
  if (!actor) return notFound('Admin user');
  if (!isSuperAdmin(actor)) {
    return forbidden('Super admin access required');
  }
  return actor;
}

/**
 * Grant audit-log access to an admin. Officials already have it, so
 * granting one is a no-op success with no audit entry and no write.
 */
export async function grantAuditAccess(
  actorId: string,
  userId: string,
): Promise<{ user: SafeUser } | ServiceError> {
  const actor = await getSuperAdminActor(actorId);
  if ('error' in actor) return actor;
  const target = await getUserById(userId);
  if (!target) return notFound('User');
  if (isSuperAdminEmail(target.email)) return { user: target };
  if (target.status !== 'active') {
    return badRequest('Only an active account can be given audit log access');
  }
  if (!hasAdminCapability(target)) {
    return badRequest('Only an admin can be given audit log access');
  }
  if (target.canViewAuditLog) return { user: target };

  const updated = await updateUser(userId, { canViewAuditLog: true });
  if (!updated) return notFound('User');
  await logAudit({
    actorId,
    action: 'admin.audit-access.grant',
    entity: 'user',
    entityId: userId,
    detail: `${target.email} granted audit log access`,
  });
  return { user: updated };
}

/**
 * Revoke audit-log access. Officials cannot be revoked. A user who
 * does not hold the flag is a no-op success — except a non-admin who
 * never held it, which is rejected so a bad target is not silently
 * accepted.
 */
export async function revokeAuditAccess(
  actorId: string,
  userId: string,
): Promise<{ user: SafeUser } | ServiceError> {
  const actor = await getSuperAdminActor(actorId);
  if ('error' in actor) return actor;
  const target = await getUserById(userId);
  if (!target) return notFound('User');
  if (isSuperAdminEmail(target.email)) {
    return forbidden('Official administrators always have audit log access and cannot be revoked');
  }
  if (!target.canViewAuditLog && !hasAdminCapability(target)) {
    return badRequest('This user does not have audit log access');
  }
  if (!target.canViewAuditLog) return { user: target };

  const updated = await updateUser(userId, { canViewAuditLog: false });
  if (!updated) return notFound('User');
  await logAudit({
    actorId,
    action: 'admin.audit-access.revoke',
    entity: 'user',
    entityId: userId,
    detail: `${target.email} audit log access revoked`,
  });
  return { user: updated };
}

/**
 * Who can view the audit log: the officials (from the two
 * OFFICIAL_ADMINS emails, where a user row exists for them) and the
 * non-official admins explicitly granted the flag.
 */
export async function listAuditAccessUsers(
  actorId: string,
): Promise<{ officials: SafeUser[]; granted: SafeUser[] } | ServiceError> {
  const actor = await getSuperAdminActor(actorId);
  if ('error' in actor) return actor;
  const users = await getAllUsers();
  const officials = users.filter((u) => isSuperAdminEmail(u.email));
  const granted = users.filter((u) => u.canViewAuditLog && !isSuperAdminEmail(u.email));
  return { officials, granted };
}
