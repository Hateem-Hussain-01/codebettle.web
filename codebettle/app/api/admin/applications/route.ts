import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdmin } from '@/lib/api-helpers';
import { applicationCreateSchema } from '@/lib/api-schemas';
import { listApplications } from '@/lib/db/applications';
import { submitApplication } from '@/lib/services/application-service';
import type { ApplicationStatus } from '@/lib/db/types';

/**
 * GET /api/admin/applications — paginated instructor applications (admin only).
 * Query params: page, limit, status=pending|approved|rejected.
 * POST /api/admin/applications — submit an application (PUBLIC, no auth:
 * the become-instructor form). Business logic lives in
 * lib/services/application-service.ts.
 */
const STATUSES = ['pending', 'approved', 'rejected'] as const;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const rawStatus = params.get('status');
  const status = rawStatus && (STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as ApplicationStatus)
    : undefined;
  const page = await listApplications({
    status,
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  return NextResponse.json({
    applications: page.items,
    page: page.page,
    totalPages: page.totalPages,
    total: page.total,
  });
}

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = applicationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Name and a valid email are required' }, { status: 400 });
  }
  const result = await submitApplication(parsed.data);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ application: result.application }, { status: 201 });
}
