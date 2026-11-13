import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { areSuccessStoryTablesReady } from '@/lib/db/success-stories';
import { listAdminSuccessStories } from '@/lib/services/success-story-service';
import { isSuccessStoryStatus } from '@/lib/success-story-categories';

/**
 * GET /api/admin/success-stories — list all submissions (any status).
 * Query params: status (pending|under_review|approved|rejected),
 * featured (true|false), search (name / email / submission number /
 * course), limit, offset. Includes `tablesReady` so the admin UI can
 * show a "run the SQL" state when the migration has not run yet.
 *
 * Guard: requireAdminArea('success-stories').
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminArea('success-stories');
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const statusParam = params.get('status');
  const featuredParam = params.get('featured');
  const limit = Math.min(Math.max(Number(params.get('limit') ?? 50) || 50, 1), 100);
  const offset = Math.max(Number(params.get('offset') ?? 0) || 0, 0);
  const [result, tablesReady] = await Promise.all([
    listAdminSuccessStories({
      status: statusParam && isSuccessStoryStatus(statusParam) ? statusParam : undefined,
      featured: featuredParam === 'true' ? true : featuredParam === 'false' ? false : undefined,
      search: params.get('search') ?? undefined,
      limit,
      offset,
    }),
    areSuccessStoryTablesReady(),
  ]);
  return NextResponse.json({
    submissions: result.items,
    total: result.total,
    limit,
    offset,
    tablesReady,
  });
}
