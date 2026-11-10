import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, serviceError } from '@/lib/api-helpers';
import {
  getAdminOverview,
  getCourseReport,
  getStudentReport,
  parseDateRange,
} from '@/lib/services/reporting-service';

/**
 * GET /api/admin/reports — admin-only reporting (Phase 4).
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD        -> admin overview for the range
 *   ?courseId=...&from&to                 -> per-course report
 *   ?studentId=...&from&to                -> per-student report
 * Unknown course/student -> 404; bad dates -> 400; non-admin -> 403.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const range = parseDateRange({
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  });
  if ('error' in range) return serviceError(range);

  const courseId = params.get('courseId');
  if (courseId) {
    const result = await getCourseReport(courseId, range);
    if ('error' in result) return serviceError(result);
    return NextResponse.json(result);
  }
  const studentId = params.get('studentId');
  if (studentId) {
    const result = await getStudentReport(studentId, range);
    if ('error' in result) return serviceError(result);
    return NextResponse.json(result);
  }
  const overview = await getAdminOverview(range);
  if ('error' in overview) return serviceError(overview);
  return NextResponse.json(overview);
}
