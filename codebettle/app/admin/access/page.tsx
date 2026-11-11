import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { firstGrantedArea, isFullAdmin } from '@/lib/admin-access';
import { hasAdminCapability } from '@/lib/rbac';
import AdminAccessClient from './access-client';

/**
 * Admin access management (Item G) — full admins only. The layout also
 * blocks restricted admins from /admin/access, but this page re-checks
 * so the gate does not depend on the layout alone.
 */
export default async function AdminAccessPage() {
  const session = await getSession();
  if (!session || !hasAdminCapability(session)) redirect('/auth/login');
  if (!isFullAdmin(session.adminPermissions)) {
    redirect(firstGrantedArea(session.adminPermissions)?.href ?? '/');
  }
  return <AdminAccessClient />;
}
