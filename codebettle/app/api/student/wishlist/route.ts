import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireRoles } from '@/lib/api-helpers';
import { addToWishlist, listWishlistForUser } from '@/lib/db/wishlist';
import { getCourseById, getCoursesByIds } from '@/lib/db/courses';
import { toPublicCourse } from '@/lib/db/mappers';

/**
 * GET /api/student/wishlist — your own wishlist entries, newest first,
 * each with its public course details (null when the course is gone).
 * POST /api/student/wishlist — add a course. Body: { courseId }.
 * Adding the same course twice is idempotent: the existing entry is
 * returned with `duplicate: true` (200), no second row is created.
 */
const wishlistSchema = z.object({
  courseId: z.string().min(1),
});

export async function GET() {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const items = await listWishlistForUser(auth.session.id);
  const courses = await getCoursesByIds(items.map((w) => w.courseId));
  const byId = new Map(courses.map((c) => [c.id, toPublicCourse(c)]));
  return NextResponse.json({
    wishlist: items.map((item) => ({ ...item, course: byId.get(item.courseId) ?? null })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  const parsed = wishlistSchema.safeParse(body);
  if (!parsed.success) return invalidBody('courseId is required');
  const course = await getCourseById(parsed.data.courseId);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  const { item, duplicate } = await addToWishlist(auth.session.id, parsed.data.courseId);
  return NextResponse.json({ item, duplicate }, { status: duplicate ? 200 : 201 });
}
