import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { firstGrantedArea } from '@/lib/admin-access';
import { hasAdminCapability } from '@/lib/rbac';
import { isSuperAdmin } from '@/lib/super-admin';
import AdminAccessClient from './access-client';

/**
 * Admin access management (Item G) — authorized administrators only
 * (Phase 5, Module 23: /admin/access is no longer merely full-admin).
 * The layout also blocks anyone else from /admin/access, but this page
 * re-checks so the gate does not depend on the layout alone.
 */
export default async function AdminAccessPage() {
  const session = await getSession();
  if (!session || !hasAdminCapability(session)) redirect('/auth/login');
  if (!isSuperAdmin(session)) {
    redirect(firstGrantedArea(session.adminPermissions)?.href ?? '/');
  }
  return <AdminAccessClient />;
}
