import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { applicationAssignStageSchema } from '@/lib/api-schemas';
import { assignStage } from '@/lib/services/recruitment-service';

/**
 * POST /api/admin/applications/[id]/stage — move a pending application
 * to a pipeline stage. Writes a history entry + audit log and notifies
 * the applicant (when they have an account). Terminal stages are NOT
 * assigned here: 'Rejected' goes through Reject, 'Successfully
 * Onboarded' through Approve & Onboard. Admin only (applications area).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('applications');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = applicationAssignStageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A stage is required' }, { status: 400 });
  }
  const result = await assignStage(auth.session, id, parsed.data.stageId, parsed.data.note);
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result);
}
