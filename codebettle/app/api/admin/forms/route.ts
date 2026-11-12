import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { createFormService, listFormsService } from '@/lib/services/form-service';

/**
 * GET /api/admin/forms — list form definitions (Phase 6).
 * Query params: page, limit, status (draft|published), type
 * (registration|survey).
 * POST /api/admin/forms — create a form definition. Body: { name,
 * slug?, type, description?, schema, status? }. The schema is
 * validated (field ids unique, types allowed, options required for
 * select/radio/checkbox); the slug is generated from the name when
 * omitted and made unique automatically.
 *
 * Guard: requireAdminArea('forms') — restricted admins need the
 * 'forms' area granted. Full admins pass.
 */
const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  slug: z.string().trim().max(200).optional(),
  type: z.enum(['registration', 'survey']),
  description: z.string().max(2000).optional(),
  schema: z.unknown(),
  status: z.enum(['draft', 'published']).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAdminArea('forms');
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const result = await listFormsService(auth.session, {
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
    status: params.get('status') ?? undefined,
    type: params.get('type') ?? undefined,
  });
  if ('error' in result) return serviceError(result);
  return NextResponse.json({
    forms: result.items,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
    hasNext: result.hasNext,
    hasPrev: result.hasPrev,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('forms');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid form' },
      { status: 400 },
    );
  }
  const result = await createFormService(auth.session, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ form: result.form }, { status: 201 });
}
