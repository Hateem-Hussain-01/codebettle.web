import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, serviceError } from '@/lib/api-helpers';
import { getExportData, parseDateRange } from '@/lib/services/reporting-service';
import { coursesCsv, enrollmentsCsv, revenueCsv, studentsCsv } from '@/lib/services/csv-export';

/**
 * GET /api/admin/reports/export — full CSV download, admin only (Phase 4).
 *   ?type=enrollments|students|courses|revenue&from=YYYY-MM-DD&to=YYYY-MM-DD
 * No row cap: every record in range is exported (the old client-side
 * export was capped at the 100-row page). Bad type / bad dates -> 400.
 */
const EXPORT_TYPES = ['enrollments', 'students', 'courses', 'revenue'] as const;
type ExportType = (typeof EXPORT_TYPES)[number];

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const type = params.get('type');
  if (!type || !(EXPORT_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${EXPORT_TYPES.join(', ')}` },
      { status: 400 },
    );
  }
  const range = parseDateRange({
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  });
  if ('error' in range) return serviceError(range);

  const data = await getExportData(range);
  if ('error' in data) return serviceError(data);
  const { enrollments, users, courses } = data;
  let csv: string;
  switch (type as ExportType) {
    case 'enrollments':
      csv = enrollmentsCsv(enrollments, users, courses);
      break;
    case 'students':
      csv = studentsCsv(users);
      break;
    case 'courses':
      csv = coursesCsv(courses, enrollments);
      break;
    case 'revenue':
      csv = revenueCsv(courses, enrollments);
      break;
  }
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="codebettle-${type}-${today}.csv"`,
    },
  });
}
