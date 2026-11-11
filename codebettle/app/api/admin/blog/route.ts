import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireRoles, serviceError, adminAreaError } from '@/lib/api-helpers';
import { blogCreateSchema } from '@/lib/api-schemas';
import { createBlogPostService } from '@/lib/services/blog-service';

/**
 * POST /api/admin/blog — create a blog post (admin or instructor-author).
 * The author is always the signed-in user. Business logic lives in
 * lib/services/blog-service.ts.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;
  const areaError = adminAreaError(auth.session, 'blog');
  if (areaError) return areaError;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = blogCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid blog post details' }, { status: 400 });
  }
  const result = await createBlogPostService(auth.session, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ post: result.post }, { status: 201 });
}
