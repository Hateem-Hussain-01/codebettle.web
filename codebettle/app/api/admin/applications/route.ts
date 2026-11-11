import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { applicationCreateSchema } from '@/lib/api-schemas';
import { listApplications } from '@/lib/db/applications';
import { getUserById } from '@/lib/db/users';
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
  const auth = await requireAdminArea('applications');
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
  // Resolve reviewer ids to names (one lookup per distinct reviewer).
  const reviewerIds = [...new Set(page.items.map((a) => a.reviewedBy).filter((x): x is string => !!x))];
  const reviewerNames = new Map<string, string>();
  for (const id of reviewerIds) {
    const user = await getUserById(id);
    if (user) reviewerNames.set(id, user.name);
  }
  return NextResponse.json({
    applications: page.items.map((a) => ({
      ...a,
      reviewedByName: a.reviewedBy ? (reviewerNames.get(a.reviewedBy) ?? null) : null,
    })),
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
    return NextResponse.json(
      { error: 'Name, a valid email, LinkedIn profile, CV, demo recording and why you are a good fit are required' },
      { status: 400 },
    );
  }
  const result = await submitApplication(parsed.data);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ application: result.application }, { status: 201 });
}
