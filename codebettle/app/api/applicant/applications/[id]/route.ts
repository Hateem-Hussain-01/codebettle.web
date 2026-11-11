import { NextResponse } from 'next/server';
import { requireSession, serviceError } from '@/lib/api-helpers';
import { getApplicantTracking } from '@/lib/services/recruitment-service';

/**
 * GET /api/applicant/applications/[id] — the applicant-safe tracking
 * view for ONE of the caller's own applications.
 *
 * ENFORCEMENT IS IN THE SERVICE (buildApplicantTrackingView), not the
 * UI: the response carries only the current stage, the completed
 * stages, the single next stage, the admin instructions for the
 * current stage, the latest update and the applicant's own
 * notifications. No full pipeline, no internal notes, no other
 * application. A non-owner gets 404 (existence is not disclosed).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await getApplicantTracking(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result);
}
