import { NextRequest, NextResponse } from 'next/server';
import { logDeniedAuditAttempt, requireSuperAdmin, serviceError } from '@/lib/api-helpers';
import { revokeAuditAccess } from '@/lib/services/audit-access-service';

/**
 * DELETE /api/admin/audit/access/[userId] — revoke audit-log viewing
 * from an admin (Phase 5, Module 23). Official administrators only;
 * a signed-in non-official gets a denial AuditLog entry first (see
 * logDeniedAuditAttempt). The service refuses unknown targets (404)
 * and officials (403 — officials always have access and cannot be
 * revoked); revoking a user who does not hold the flag is a no-op
 * success. Response: { user } (safe fields).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireSuperAdmin();
  if ('error' in auth) {
    await logDeniedAuditAttempt('DELETE /api/admin/audit/access/[userId]');
    return auth.error;
  }
  const { userId } = await params;
  const result = await revokeAuditAccess(auth.session.id, userId);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ user: result.user });
}
