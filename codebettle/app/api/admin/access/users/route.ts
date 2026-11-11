import { NextRequest, NextResponse } from 'next/server';
import { requireFullAdmin, serviceError } from '@/lib/api-helpers';
import { listAccessUsers } from '@/lib/services/admin-access-service';

/**
 * GET /api/admin/access/users — every user (safe fields only, never the
 * password hash) with role + adminPermissions, for the /admin/access
 * picker. Full admins only: a restricted admin must not see who else
 * has access, let alone change it.
 */
export async function GET(_request: NextRequest) {
  const auth = await requireFullAdmin();
  if ('error' in auth) return auth.error;
  const result = await listAccessUsers(auth.session.id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ users: result.users });
}
