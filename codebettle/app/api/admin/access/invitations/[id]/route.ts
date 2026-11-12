import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, serviceError } from '@/lib/api-helpers';
import { revokeInvitation } from '@/lib/services/invitation-service';

/**
 * DELETE /api/admin/access/invitations/[id] — revoke an unused
 * invitation (pending or expired). Official administrators only. A used
 * invitation is history and cannot be revoked (400). The invited
 * person never had an account, so revoking deletes only the
 * invitation row — no user, sessions or data are touched.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await revokeInvitation(auth.session.id, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true });
}
