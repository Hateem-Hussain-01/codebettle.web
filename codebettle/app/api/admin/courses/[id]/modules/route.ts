import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdmin, serviceError } from '@/lib/api-helpers';
import { moduleCreateSchema } from '@/lib/api-schemas';
import { createModuleService } from '@/lib/services/course-service';

/** POST /api/admin/courses/[id]/modules — add a module (admin only). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = moduleCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  const result = await createModuleService(auth.session, id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ module: result.module }, { status: 201 });
}
