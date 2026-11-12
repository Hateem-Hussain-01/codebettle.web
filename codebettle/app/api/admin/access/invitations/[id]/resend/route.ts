import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, serviceError } from '@/lib/api-helpers';
import { resendInvitation } from '@/lib/services/invitation-service';

/**
 * POST /api/admin/access/invitations/[id]/resend — send a fresh
 * invitation for the same person. Official administrators only. The old
 * invitation is revoked (its link stops working) and a new one is
 * created with the same name/contact/grants, a new token and a new
 * 7-day window. A used invitation cannot be resent (400) — the
 * account already exists.
 *
 * Success: { invitation, inviteUrl, emailSent } — same shape as
 * create, so the admin can copy the new link when email is not
 * configured.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await resendInvitation(auth.session.id, id, {
    baseUrl: request.nextUrl.origin,
  });
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result, { status: 201 });
}
