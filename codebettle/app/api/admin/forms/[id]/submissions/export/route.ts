import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea, serviceError } from '@/lib/api-helpers';
import { exportFormSubmissionsCsvService } from '@/lib/services/form-service';

/**
 * GET /api/admin/forms/[id]/submissions/export — download every
 * submission for a form as CSV (Phase 6). One row per submission,
 * one column per schema field (in field order).
 *
 * Guard: requireAdminArea('forms').
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('forms');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await exportFormSubmissionsCsvService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    },
  });
}
