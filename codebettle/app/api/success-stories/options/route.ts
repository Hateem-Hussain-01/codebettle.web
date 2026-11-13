import { NextResponse } from 'next/server';
import { getPublishedCourses } from '@/lib/db/courses';
import { getBatchesByCourse } from '@/lib/db/batches';

/**
 * GET /api/success-stories/options — published courses with their
 * batches, for the form's course + batch dropdowns. Public, no private
 * data: only course id/title/slug and batch id/number/status.
 */
export async function GET() {
  const courses = await getPublishedCourses();
  const options = [];
  for (const course of courses) {
    const batches = await getBatchesByCourse(course.id);
    options.push({
      id: course.id,
      title: course.title,
      slug: course.slug,
      batches: batches.map((b) => ({ id: b.id, batchNumber: b.batchNumber, status: b.status })),
    });
  }
  return NextResponse.json({ courses: options });
}
