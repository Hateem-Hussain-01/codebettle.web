import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import {
  getFormSubmissionService,
  markFormSubmissionReviewedService,
} from '@/lib/services/form-service';

/**
 * GET /api/admin/forms/[id]/submissions/[submissionId] — one submission.
 * PATCH — mark it reviewed / unreviewed. Body: { reviewed: boolean }.
 *
 * Guard: requireAdminArea('forms').
 */
const patchSchema = z.object({
  reviewed: z.boolean(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> },
) {
  const auth = await requireAdminArea('forms');
  if ('error' in auth) return auth.error;
  const { id, submissionId } = await params;
  const result = await getFormSubmissionService(auth.session, id, submissionId);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ form: result.form, submission: result.submission });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> },
) {
  const auth = await requireAdminArea('forms');
  if ('error' in auth) return auth.error;
  const { id, submissionId } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid update' },
      { status: 400 },
    );
  }
  const result = await markFormSubmissionReviewedService(
    auth.session,
    id,
    submissionId,
    parsed.data.reviewed,
  );
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ submission: result.submission });
}
