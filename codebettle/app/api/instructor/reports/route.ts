import { NextRequest, NextResponse } from 'next/server';
import { requireRoles, serviceError } from '@/lib/api-helpers';
import { getInstructorReport, parseDateRange } from '@/lib/services/reporting-service';

/**
 * GET /api/instructor/reports — report for the signed-in instructor
 * only, over their own courses (Phase 4).
 * Admins are not instructors, so an admin calling this gets 403;
 * students get 403; signed-out callers get 401. Bad dates -> 400.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(['instructor']);
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const range = parseDateRange({
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  });
  if ('error' in range) return serviceError(range);
  const report = await getInstructorReport(auth.session.id, range);
  if ('error' in report) return serviceError(report);
  return NextResponse.json(report);
}
