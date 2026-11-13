import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { isBookACallTableReady, listBookACalls } from '@/lib/db/book-a-call';
import type { BookACallStatus } from '@/lib/db/types';

/**
 * GET /api/admin/book-a-call — paginated book-a-call requests (admin only).
 * Query params: page, limit, status=new|contacted|done.
 * Returns { bookings, page, totalPages, total, tableMissing }.
 * tableMissing is true when the BookACall SQL migration has not run
 * yet — the UI shows a "run the SQL" state instead of an error.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminArea('book-a-call');
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const statusParam = params.get('status');
  const status: BookACallStatus | undefined =
    statusParam === 'new' || statusParam === 'contacted' || statusParam === 'done' ? statusParam : undefined;
  const tableMissing = !(await isBookACallTableReady());
  const page = await listBookACalls({
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
    status,
  });
  return NextResponse.json({
    bookings: page.items,
    page: page.page,
    totalPages: page.totalPages,
    total: page.total,
    tableMissing,
  });
}
