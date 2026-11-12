import { NextRequest, NextResponse } from 'next/server';
import { serviceError } from '@/lib/api-helpers';
import { getPublishedFormBySlugService } from '@/lib/services/form-service';

/**
 * GET /api/forms/[slug] — the public shape of a published form
 * (Phase 6): { id, name, description, type, schema }. Draft forms
 * and unknown slugs both 404 — a draft must never leak its fields.
 * Public: no auth.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await getPublishedFormBySlugService(slug);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ form: result.form });
}
