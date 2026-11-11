import { NextResponse } from 'next/server';
import { requireAdminArea, serviceError } from '@/lib/api-helpers';
import { onboardApplication } from '@/lib/services/recruitment-service';

/**
 * POST /api/admin/applications/[id]/onboard — "Approve & Onboard as
 * Teacher": the final admin action for an APPROVED application.
 * Sets isTeacher=true on the SAME account (primary role student ->
 * instructor; instructor/admin untouched), writes an 'onboarded'
 * history entry + audit log, and notifies the applicant. No new
 * account, no new password, no session revocation — the applicant
 * signs in with their existing credentials and lands on the Teacher
 * Portal. Admin only (applications area).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('applications');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await onboardApplication(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result);
}
