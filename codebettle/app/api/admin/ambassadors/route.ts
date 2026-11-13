import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { isAmbassadorApplicationTableReady, listAmbassadorApplications } from '@/lib/db/ambassador-applications';
import type { AmbassadorApplicationStatus } from '@/lib/db/types';

/**
 * GET /api/admin/ambassadors — paginated ambassador applications (admin only).
 * Query params: page, limit, status=pending|approved|rejected.
 * Returns { applications, page, totalPages, total, tableMissing }.
 * tableMissing is true when the AmbassadorApplication SQL migration
 * has not run yet — the UI shows a "run the SQL" state instead of an
 * error.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminArea('ambassadors');
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const statusParam = params.get('status');
  const status: AmbassadorApplicationStatus | undefined =
    statusParam === 'pending' || statusParam === 'approved' || statusParam === 'rejected'
      ? statusParam
      : undefined;
  const tableMissing = !(await isAmbassadorApplicationTableReady());
  const page = await listAmbassadorApplications({
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
    status,
  });
  return NextResponse.json({
    applications: page.items,
    page: page.page,
    totalPages: page.totalPages,
    total: page.total,
    tableMissing,
  });
}
