import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireRoles, serviceError, adminAreaError } from '@/lib/api-helpers';
import { blogUpdateSchema } from '@/lib/api-schemas';
import { deleteBlogPostService, updateBlogPostService } from '@/lib/services/blog-service';

/**
 * PATCH /api/admin/blog/[id] — edit a blog post (admin, or the
 * instructor who wrote it). DELETE — hard-delete a blog post (same rule;
 * BlogPost has no deletedAt column). Business logic lives in
 * lib/services/blog-service.ts.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;
  const areaError = adminAreaError(auth.session, 'blog');
  if (areaError) return areaError;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = blogUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid blog post details' }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const result = await updateBlogPostService(auth.session, id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ post: result.post });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;
  const areaError = adminAreaError(auth.session, 'blog');
  if (areaError) return areaError;
  const { id } = await params;

  const result = await deleteBlogPostService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true });
}
