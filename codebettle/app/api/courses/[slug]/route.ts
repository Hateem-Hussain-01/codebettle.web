import { NextRequest, NextResponse } from 'next/server';
import { getCourseBySlug } from '@/lib/db/courses';
import { toPublicCourse } from '@/lib/db/mappers';

/** GET /api/courses/[slug] — one course with its curriculum (public). Zoom link, recording URLs and materials URLs stripped: enrolled students with a confirmed payment only, via GET /api/student/courses/[id]/content. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }
  return NextResponse.json(toPublicCourse(course));
}
