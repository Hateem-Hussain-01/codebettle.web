import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { firstGrantedArea } from '@/lib/admin-access';
import { hasAdminCapability } from '@/lib/rbac';
import { isSuperAdmin } from '@/lib/super-admin';
import AuditClient from './audit-client';

/**
 * Audit log (Phase 5, Module 23) — server wrapper.
 *
 * Access is enforced here as well as in the admin layout: admin
 * capability AND (authorized administrator OR the session's
 * canViewAuditLog grant, carried by Worker A). Anyone else is sent to
 * the first area they do have. The entries themselves are loaded by
 * the client from GET /api/admin/audit, which enforces the same rule.
 * The Access & Permissions section is rendered only for authorized
 * administrators (canManageAccess) — the client hides it otherwise.
 */
export default async function AdminAuditPage() {
  const session = await getSession();
  if (!session || !hasAdminCapability(session)) redirect('/auth/login');
  const authorized = isSuperAdmin(session);
  const canViewAuditLog = session.canViewAuditLog === true;
  if (!authorized && !canViewAuditLog) {
    redirect(firstGrantedArea(session.adminPermissions)?.href ?? '/');
  }
  return <AuditClient canManageAccess={authorized} />;
}
