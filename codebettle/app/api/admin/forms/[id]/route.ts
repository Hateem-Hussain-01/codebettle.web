import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { deleteFormService, getFormService, updateFormService } from '@/lib/services/form-service';

/**
 * GET /api/admin/forms/[id] — one form definition.
 * PATCH /api/admin/forms/[id] — update it. Body: any of { name,
 * slug?, type?, description?, schema?, status? }. Renaming never
 * changes the slug unless one is passed explicitly (published URLs
 * stay stable); a passed slug must be unique. The schema is
 * re-validated on every update.
 * DELETE /api/admin/forms/[id] — delete the form and its submissions.
 *
 * Guard: requireAdminArea('forms').
 */
const patchSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200).optional(),
  slug: z.string().trim().max(200).optional(),
  type: z.string().trim().min(1, 'Purpose is required').max(50).optional(),
  description: z.string().max(2000).nullable().optional(),
  schema: z.unknown().optional(),
  status: z.enum(['draft', 'published']).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('forms');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await getFormService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ form: result.form });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('forms');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid update' },
      { status: 400 },
    );
  }
  const result = await updateFormService(auth.session, id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ form: result.form });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('forms');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await deleteFormService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ deleted: true });
}
