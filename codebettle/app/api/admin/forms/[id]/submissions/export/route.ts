import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea, serviceError } from '@/lib/api-helpers';
import { exportFormSubmissionsCsvService } from '@/lib/services/form-service';

/**
 * GET /api/admin/forms/[id]/submissions/export — download every
 * submission for a form as CSV (Phase 6). One row per submission,
 * one column per schema field (in field order). Query param
 * `reviewed=true|false` limits the export to reviewed or
 * unreviewed submissions only; omitted = all submissions.
 * The response carries an `X-Export-Count` header with the number
 * of exported rows.
 *
 * Guard: requireAdminArea('forms').
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('forms');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const reviewedParam = request.nextUrl.searchParams.get('reviewed');
  if (reviewedParam !== null && reviewedParam !== 'true' && reviewedParam !== 'false') {
    return NextResponse.json(
      { error: 'reviewed must be true or false' },
      { status: 400 },
    );
  }
  const result = await exportFormSubmissionsCsvService(auth.session, id, {
    reviewed: reviewedParam === null ? undefined : reviewedParam === 'true',
  });
  if ('error' in result) return serviceError(result);
  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'X-Export-Count': String(result.count),
    },
  });
}
